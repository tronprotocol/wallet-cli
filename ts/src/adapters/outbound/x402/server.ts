import { facilitatorNetwork } from "./facilitator-network.js";
import { addressCodec } from "../../../domain/family/index.js";
import { X402_TOKENS } from "./tokens.js";
import { providerPaymentError, sdkPaymentError } from "./payment-error.js";
import { successfulSettlement } from "./settlement.js";
import { fetchBounded } from "../http/http-response.js";
import { createServer, type Server } from "node:http";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@bankofai/x402-core/http";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type {
  X402ServeInput,
  X402ServerHandle,
  X402ServerPort,
} from "../../../application/ports/x402-server.js";
import { TransportError, UsageError, ExecutionError } from "../../../domain/errors/index.js";

export class X402HttpServer implements X402ServerPort {
  constructor(
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly timeoutMs = 60000,
    private readonly log: (line: string) => void = (line) => {
      process.stderr.write(`${line}\n`);
    },
  ) {}

  validate(network: NetworkDescriptor, input: X402ServeInput): void {
    this.requirement(network, input);
  }

  private requirement(network: NetworkDescriptor, input: X402ServeInput) {
    if (input.scheme === "exact_gasfree" && network.family !== "tron") {
      throw new UsageError("invalid_value", "exact_gasfree is supported only on TRON");
    }
    if (input.maxGasfreeFee !== undefined && input.maxGasfreeFeeRaw !== undefined)
      throw new UsageError("invalid_option", "GasFree fee limits are mutually exclusive");
    if (
      input.maxGasfreeFeeRaw !== undefined &&
      (!/^\d{1,78}$/.test(input.maxGasfreeFeeRaw) ||
        BigInt(input.maxGasfreeFeeRaw) <= 0n ||
        BigInt(input.maxGasfreeFeeRaw) >= 1n << 256n)
    )
      throw new UsageError("invalid_amount", "GasFree fee limit must be a positive uint256");
    if (input.gasfreeRelay && !["official", "gasfree"].includes(input.gasfreeRelay)) {
      let relay: URL;
      try {
        relay = new URL(input.gasfreeRelay);
      } catch {
        throw new UsageError("invalid_option", "GasFree relay must be official, gasfree or HTTPS");
      }
      if (
        relay.protocol !== "https:" ||
        relay.username ||
        relay.password ||
        relay.search ||
        relay.hash
      )
        throw new UsageError(
          "invalid_option",
          "GasFree relay must be HTTPS without credentials, query or fragment",
        );
    }
    const registered = X402_TOKENS[network.id] ?? {};
    if (input.amount !== undefined && input.rawAmount !== undefined)
      throw new UsageError("invalid_option", "amount and raw amount are mutually exclusive");
    if (input.token !== undefined && input.asset !== undefined)
      throw new UsageError("invalid_option", "token and asset are mutually exclusive");
    if (
      input.decimals !== undefined &&
      (!input.asset ||
        !Number.isInteger(input.decimals) ||
        input.decimals < 0 ||
        input.decimals > 18)
    )
      throw new UsageError("invalid_option", "decimals requires an asset and must be from 0 to 18");
    const known = input.asset
      ? Object.values(registered).find((item) =>
          network.family === "evm"
            ? item.address.toLowerCase() === input.asset!.toLowerCase()
            : item.address === input.asset,
        )
      : registered[(input.token ?? "USDT").toUpperCase()];
    if (known && input.decimals !== undefined && input.decimals !== known.decimals)
      throw new UsageError(
        "invalid_option",
        "explicit decimals must match the registered token precision",
      );
    if (input.asset && !addressCodec(network.family).validate(input.asset))
      throw new UsageError("invalid_address", "invalid payment asset address");
    if (!known && (!input.asset || input.decimals === undefined))
      throw new UsageError(
        "invalid_value",
        "use a registered token or an explicit asset with decimals",
      );
    const token = known ?? {
      address: input.asset!,
      decimals: input.decimals!,
      name: "",
      version: "1",
      permit2: true,
    };
    if (input.maxGasfreeFee !== undefined) toSmallestUnit(input.maxGasfreeFee, token.decimals);
    validatePayTo(network, input.payTo);
    const validity = input.validForSeconds ?? 300;
    if (!Number.isInteger(validity) || validity < 1 || validity > 86400)
      throw new UsageError("invalid_value", "valid-for-seconds must be from 1 to 86400");
    if (input.resourceUrl) {
      const resource = new URL(input.resourceUrl);
      if (
        !["http:", "https:"].includes(resource.protocol) ||
        resource.username ||
        resource.password
      )
        throw new UsageError("invalid_value", "resource-url must be HTTP(S) without credentials");
    }
    const rawAmount = input.rawAmount ?? toSmallestUnit(input.amount ?? "0.0001", token.decimals);
    if (!/^\d{1,78}$/.test(rawAmount) || BigInt(rawAmount) <= 0n || BigInt(rawAmount) >= 1n << 256n)
      throw new UsageError("invalid_amount", "raw amount must be a positive uint256");
    return { token, rawAmount };
  }

  async start(network: NetworkDescriptor, input: X402ServeInput): Promise<X402ServerHandle> {
    const { token, rawAmount } = this.requirement(network, input);
    const x402Network = await facilitatorNetwork(
      network,
      input.scheme,
      input.facilitatorUrl,
      this.fetcher,
      this.timeoutMs,
    );
    const host = input.host.includes(":") ? `[${input.host}]` : input.host;
    let resourceUrl = `http://${host}:${input.port}/pay`;
    const requirement = {
      scheme: input.scheme,
      network: x402Network,
      amount: rawAmount,
      asset: token.address,
      payTo: input.payTo,
      maxTimeoutSeconds: input.validForSeconds ?? 300,
      extra:
        input.scheme === "exact_gasfree"
          ? {}
          : token.permit2
            ? { assetTransferMethod: "permit2" }
            : { name: token.name, version: token.version },
    };
    const challenge = {
      x402Version: 2,
      error: "Payment required",
      resource: { url: input.resourceUrl ?? resourceUrl },
      accepts: [requirement],
    };
    const server = createServer(async (request, response) => {
      const started = performance.now();
      response.once("finish", () => {
        // Do not log URLs, queries, headers, bodies or payment signatures.
        const path = (request.url ?? "").split("?")[0];
        const route = ["/health", "/.well-known/x402", "/pay"].includes(path!) ? path : "other";
        this.log(
          JSON.stringify({
            event: "x402.request",
            method: request.method,
            route,
            status: response.statusCode,
            durationMs: Math.round(performance.now() - started),
          }),
        );
      });
      let pathname: string;
      try {
        pathname = new URL(request.url ?? "/", resourceUrl).pathname;
      } catch {
        return json(response, 400, { error: "invalid request URL" });
      }
      if (pathname === "/health") return json(response, 200, { ok: true });
      if (pathname === "/.well-known/x402" && request.method === "GET") {
        return json(response, 200, {
          x402Version: 2,
          resource: challenge.resource,
          accepts: challenge.accepts,
        });
      }
      if (pathname !== "/pay") return json(response, 404, { error: "not found" });
      const signature = request.headers["payment-signature"];
      if (!signature || Array.isArray(signature)) {
        response.setHeader("payment-required", encodePaymentRequiredHeader(challenge as never));
        return json(response, 402, challenge);
      }
      let phase: "verify" | "settle" = "verify";
      try {
        const paymentPayload = decodePaymentSignatureHeader(signature);
        const verify = await this.facilitator(input.facilitatorUrl, "/verify", {
          paymentPayload,
          paymentRequirements: requirement,
        });
        if (!(verify.valid === true || verify.isValid === true))
          return paymentFailure(response, 400, verify.invalidReason ?? verify.errorReason, phase);
        phase = "settle";
        const settle = await this.facilitator(input.facilitatorUrl, "/settle", {
          paymentPayload,
          paymentRequirements: requirement,
        });
        if (!successfulSettlement(settle, x402Network))
          return paymentFailure(response, 502, settle.errorReason, phase, settle);
        response.setHeader("payment-response", encodePaymentResponseHeader(settle as never));
        return json(response, 200, {
          success: true,
          network: network.id,
          scheme: input.scheme,
          transaction: settle.transaction,
        });
      } catch (error) {
        const classified = sdkPaymentError(error, phase);
        const details = classified.details as Record<string, unknown> | undefined;
        return paymentFailure(response, 502, details?.reason ?? classified.code, phase, details);
      }
    });
    await listen(server, input.host, input.port);
    const address = server.address();
    if (address && typeof address === "object") {
      resourceUrl = `http://${host}:${address.port}/pay`;
      challenge.resource.url = input.resourceUrl ?? resourceUrl;
    }
    return {
      details: {
        payUrl: resourceUrl,
        network: network.id,
        scheme: input.scheme,
        token: input.token?.toUpperCase() ?? (input.asset ? undefined : "USDT"),
        asset: token.address,
        decimals: token.decimals,
        validForSeconds: input.validForSeconds ?? 300,
        resourceUrl: challenge.resource.url,
        amount: input.amount,
        rawAmount,
        payTo: input.payTo,
      },
      close: () => close(server),
    };
  }

  private async facilitator(
    base: string,
    path: string,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await fetchBounded(
      this.fetcher,
      new URL(path, `${base.replace(/\/+$/, "")}/`),
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      },
      this.timeoutMs,
      1024 * 1024,
    );
    if (!response.ok)
      throw new TransportError(
        response.status === 429 ? "provider_rate_limited" : "provider_error",
        `facilitator returned HTTP ${response.status}`,
        {
          httpStatus: response.status,
        },
      );
    return (await response.json()) as Record<string, unknown>;
  }
}

function validatePayTo(network: NetworkDescriptor, value: string): void {
  const valid = addressCodec(network.family).validate(value);
  if (!valid && addressCodec(network.family === "evm" ? "tron" : "evm").validate(value)) {
    throw new UsageError("family_mismatch", "--pay-to belongs to a different chain family");
  }
  if (!valid)
    throw new UsageError(
      "invalid_address",
      `invalid ${network.family.toUpperCase()} --pay-to address`,
    );
}

export function toSmallestUnit(value: string, decimals: number): string {
  if (!/^\d+(?:\.\d+)?$/.test(value))
    throw new UsageError("invalid_amount", "amount must be a decimal string");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new UsageError("invalid_amount", `amount supports at most ${decimals} decimal places`);
  const raw =
    BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n || raw >= 1n << 256n)
    throw new UsageError("invalid_amount", "amount must be a positive uint256");
  return raw.toString();
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "EADDRINUSE"
          ? new ExecutionError("port_in_use", "x402 server port is already in use")
          : error,
      );
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function paymentFailure(
  response: import("node:http").ServerResponse,
  status: number,
  reason: unknown,
  phase: "verify" | "settle",
  evidence?: Record<string, unknown>,
): void {
  const error = providerPaymentError(reason, phase, evidence);
  json(response, status, { code: error.code, error: error.message, ...error.details });
}
