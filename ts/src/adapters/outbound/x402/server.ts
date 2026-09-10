import { providerPaymentError } from "./payment-error.js";
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
import { TransportError, UsageError } from "../../../domain/errors/index.js";

interface Token {
  address: string;
  decimals: number;
  name: string;
  version: string;
  permit2?: boolean;
}
const TOKENS: Record<string, Record<string, Token>> = {
  "tron:728126428": {
    USDT: {
      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      decimals: 6,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
    USDD: {
      address: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
      decimals: 18,
      name: "Decentralized USD",
      version: "1",
      permit2: true,
    },
  },
  "tron:3448148188": {
    USDT: {
      address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      decimals: 6,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
    USDD: {
      address: "TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK",
      decimals: 18,
      name: "Decentralized USD",
      version: "1",
      permit2: true,
    },
  },
  "tron:2494104990": {
    USDT: {
      address: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
      decimals: 6,
      name: "Tether USD",
      version: "1",
    },
  },
  "eip155:56": {
    USDT: {
      address: "0x55d398326f99059fF775485246999027B3197955",
      decimals: 18,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
  },
  "eip155:8453": {
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      name: "USD Coin",
      version: "2",
    },
  },
  "eip155:97": {
    USDT: {
      address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
      decimals: 18,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
    USDC: {
      address: "0x64544969ed7EBf5f083679233325356EbE738930",
      decimals: 18,
      name: "USD Coin",
      version: "1",
      permit2: true,
    },
  },
};

export class X402HttpServer implements X402ServerPort {
  constructor(
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly timeoutMs = 60000,
  ) {}

  validate(network: NetworkDescriptor, input: X402ServeInput): void {
    this.requirement(network, input);
  }

  private requirement(network: NetworkDescriptor, input: X402ServeInput) {
    if (input.scheme === "exact_gasfree" && network.family !== "tron") {
      throw new UsageError("invalid_value", "exact_gasfree is supported only on TRON");
    }
    const token = TOKENS[network.id]?.[input.token.toUpperCase()];
    if (!token)
      throw new UsageError("invalid_value", `${input.token} is not registered on ${network.id}`);
    validatePayTo(network, input.payTo);
    const rawAmount = toSmallestUnit(input.amount, token.decimals);
    return { token, rawAmount };
  }

  async start(network: NetworkDescriptor, input: X402ServeInput): Promise<X402ServerHandle> {
    const { token, rawAmount } = this.requirement(network, input);
    const x402Network =
      network.family === "tron" ? `tron:0x${BigInt(network.chainId).toString(16)}` : network.id;
    const host = input.host.includes(":") ? `[${input.host}]` : input.host;
    let resourceUrl = `http://${host}:${input.port}/pay`;
    const requirement = {
      scheme: input.scheme,
      network: x402Network,
      amount: rawAmount,
      asset: token.address,
      payTo: input.payTo,
      maxTimeoutSeconds: 300,
      extra:
        input.scheme === "exact_gasfree"
          ? { name: token.name, version: token.version }
          : token.permit2
            ? { assetTransferMethod: "permit2" }
            : { name: token.name, version: token.version },
    };
    const challenge = {
      x402Version: 2,
      error: "Payment required",
      resource: { url: resourceUrl },
      accepts: [requirement],
    };
    const server = createServer(async (request, response) => {
      let pathname: string;
      try {
        pathname = new URL(request.url ?? "/", resourceUrl).pathname;
      } catch {
        return json(response, 400, { error: "invalid request URL" });
      }
      if (pathname === "/health") return json(response, 200, { ok: true });
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
          network: x402Network,
          scheme: input.scheme,
          transaction: settle.transaction,
        });
      } catch (error) {
        return paymentFailure(
          response,
          502,
          error instanceof TransportError ? error.code : undefined,
          phase,
          error instanceof TransportError
            ? (error.details as Record<string, unknown> | undefined)
            : undefined,
        );
      }
    });
    await listen(server, input.host, input.port);
    const address = server.address();
    if (address && typeof address === "object") {
      resourceUrl = `http://${host}:${address.port}/pay`;
      challenge.resource.url = resourceUrl;
    }
    return {
      details: {
        payUrl: resourceUrl,
        network: network.id,
        scheme: input.scheme,
        token: input.token.toUpperCase(),
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
      throw new TransportError("provider_error", `facilitator returned HTTP ${response.status}`, {
        httpStatus: response.status,
      });
    return (await response.json()) as Record<string, unknown>;
  }
}

function validatePayTo(network: NetworkDescriptor, value: string): void {
  const valid =
    network.family === "evm"
      ? /^0x[0-9a-fA-F]{40}$/.test(value)
      : /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
  if (!valid)
    throw new UsageError(
      "invalid_address",
      `invalid ${network.family.toUpperCase()} --pay-to address`,
    );
}

export function toSmallestUnit(value: string, decimals: number): string {
  if (!/^\d+(?:\.\d+)?$/.test(value))
    throw new UsageError("invalid_value", "amount must be a decimal string");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new UsageError("invalid_value", `amount supports at most ${decimals} decimal places`);
  return (
    BigInt(whole!) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  ).toString();
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
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
