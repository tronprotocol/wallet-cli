import {
  x402Client,
  wrapFetchWithPayment,
  decodePaymentResponseHeader,
} from "@bankofai/x402-fetch";
import { registerExactEvmScheme } from "@bankofai/x402-evm/exact/client";
import { createClientTronSigner, type ClientTronSigner } from "@bankofai/x402-tron";
import { registerExactTronScheme } from "@bankofai/x402-tron/exact/client";
import { registerExactGasFreeTronScheme } from "@bankofai/x402-tron/gasfree/client";
import type { ClientEvmSigner } from "@bankofai/x402-evm";
import type { Network } from "@bankofai/x402-core/types";
import type { X402PayInput, X402PaymentPort } from "../../../application/ports/x402-payment.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { TransactionScope } from "../../../application/contracts/execution-scope.js";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";
import { CliError, TransportError, UsageError } from "../../../domain/errors/index.js";
import { WalletX402Signer } from "./wallet-signer.js";

type PaidFetchFactory = (
  network: NetworkDescriptor,
  signer: Signer,
  scope: TransactionScope,
) => Promise<typeof fetch>;

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export class X402PaymentClient implements X402PaymentPort {
  constructor(
    private readonly signers: SignerResolver,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly paidFetchFactory?: PaidFetchFactory,
  ) {}

  async pay(scope: TransactionScope, network: NetworkDescriptor, input: X402PayInput) {
    const headers = parseHeaders(input.headers);
    this.signers.assertCanSign(scope.activeAccount, network.family);
    const signer = this.signers.resolve(scope.activeAccount, network.family);
    const paidFetch = this.paidFetchFactory
      ? await this.paidFetchFactory(network, signer, scope)
      : await this.createPaidFetch(network, signer, scope, input);

    let response: Response;
    try {
      response = await paidFetch(input.url, {
        method: input.method,
        headers,
        redirect: "error",
        ...(input.body === undefined ? {} : { body: input.body }),
      });
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (error instanceof Error && /timeout|aborted/i.test(`${error.name} ${error.message}`)) {
        throw new TransportError("timeout", "x402 request timed out");
      }
      throw new TransportError("provider_error", "x402 request or payment failed");
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new TransportError("response_too_large", "x402 response exceeds the 10 MB limit");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new TransportError("response_too_large", "x402 response exceeds the 10 MB limit");
    }
    const text = new TextDecoder().decode(bytes);
    const contentType = response.headers.get("content-type") ?? "";
    let body: unknown = text;
    if (/json/i.test(contentType) && text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        throw new TransportError("invalid_x402_response", "paid endpoint returned malformed JSON");
      }
    }
    const paymentHeader =
      response.headers.get("payment-response") ?? response.headers.get("x-payment-response");
    let paymentResponse: unknown;
    if (paymentHeader) {
      try {
        paymentResponse = decodePaymentResponseHeader(paymentHeader);
      } catch {
        throw new TransportError(
          "invalid_settlement",
          "paid endpoint returned an invalid payment settlement header",
        );
      }
    }
    return {
      url: input.url,
      status: response.status,
      delivered: response.ok,
      settled: paymentResponse !== undefined,
      payer: { address: signer.address },
      ...(paymentResponse === undefined ? {} : { paymentResponse }),
      response: body,
    };
  }

  private async createPaidFetch(
    network: NetworkDescriptor,
    signer: Signer,
    scope: TransactionScope,
    input: X402PayInput,
  ): Promise<typeof fetch> {
    const bridge = new WalletX402Signer(signer, scope);
    const client = new x402Client();
    // The SDK's conservative default spend control remains active unless the caller supplied
    // an explicit wallet-cli ceiling. In that case our exact raw/human limit below is authoritative.
    if (input.maxAmount !== undefined || input.maxRawAmount !== undefined) {
      client.setSpendControls(false);
    }
    client.registerPolicy((_version, requirements) => {
      const matching = requirements.filter((requirement) => {
        if (input.scheme && requirement.scheme !== input.scheme) return false;
        if (input.asset && requirement.asset.toLowerCase() !== input.asset.toLowerCase())
          return false;
        if (input.token && tokenSymbol(network.id, requirement.asset) !== input.token.toUpperCase())
          return false;
        return true;
      });
      if (matching.length === 0) {
        throw new TransportError(
          "no_matching_requirement",
          "the endpoint offered no matching x402 payment requirement",
        );
      }
      const selected = matching[0]!;
      const limit =
        input.maxRawAmount ??
        (input.maxAmount === undefined
          ? undefined
          : decimalToRaw(
              input.maxAmount,
              input.decimals ?? tokenDecimals(network.id, selected.asset),
            ));
      if (limit !== undefined && BigInt(selected.amount) > BigInt(limit)) {
        throw new TransportError(
          "amount_exceeds_limit",
          "the x402 payment requirement exceeds the configured limit",
        );
      }
      return matching;
    });
    const x402Network =
      network.family === "tron" ? `tron:0x${BigInt(network.chainId).toString(16)}` : network.id;
    if (network.family === "evm") {
      registerExactEvmScheme(client, {
        signer: bridge as ClientEvmSigner,
        networks: [x402Network as Network],
        schemeOptions: network.httpEndpoint ? { rpcUrl: network.httpEndpoint } : undefined,
      });
    } else {
      const tronSigner = await createClientTronSigner(bridge, {
        network: x402Network,
        ...(network.httpEndpoint ? { rpcUrl: network.httpEndpoint } : {}),
        ...(network.apiKey ? { apiKey: network.apiKey } : {}),
        allowanceMode: "skip",
      });
      registerExactTronScheme(client, {
        signer: tronSigner as ClientTronSigner,
        networks: [x402Network as Network],
      });
      registerExactGasFreeTronScheme(client, {
        signer: tronSigner as ClientTronSigner,
        networks: [x402Network as Network],
      });
    }
    const boundedFetch: typeof fetch = (request, init) =>
      this.fetcher(request, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(scope.timeoutMs),
      });
    return wrapFetchWithPayment(boundedFetch, client);
  }
}

const TOKEN_METADATA: Record<string, Record<string, { symbol: string; decimals: number }>> = {
  "tron:728126428": {
    TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: { symbol: "USDT", decimals: 6 },
    TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz: { symbol: "USDD", decimals: 18 },
  },
  "tron:3448148188": {
    TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf: { symbol: "USDT", decimals: 6 },
    TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK: { symbol: "USDD", decimals: 18 },
  },
  "tron:2494104990": {
    TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs: { symbol: "USDT", decimals: 6 },
  },
  "eip155:56": {
    "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  },
  "eip155:97": {
    "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd": { symbol: "USDT", decimals: 18 },
    "0x64544969ed7ebf5f083679233325356ebe738930": { symbol: "USDC", decimals: 18 },
  },
};

function metadata(network: string, asset: string) {
  const tokens = TOKEN_METADATA[network] ?? {};
  return tokens[asset] ?? tokens[asset.toLowerCase()];
}

function tokenSymbol(network: string, asset: string): string | undefined {
  return metadata(network, asset)?.symbol;
}

function tokenDecimals(network: string, asset: string): number {
  const decimals = metadata(network, asset)?.decimals;
  if (decimals === undefined) {
    throw new UsageError(
      "invalid_option",
      "--max-amount requires a known token or explicit --decimals",
    );
  }
  return decimals;
}

function decimalToRaw(value: string, decimals: number): string {
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new UsageError("invalid_value", `amount supports at most ${decimals} decimal places`);
  return (
    BigInt(whole!) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  ).toString();
}

function parseHeaders(values: string[]): Headers {
  const headers = new Headers();
  for (const value of values) {
    const colon = value.indexOf(":");
    if (colon <= 0) {
      throw new UsageError("invalid_value", '--header must use "Name: value"');
    }
    const name = value.slice(0, colon).trim();
    const fieldValue = value.slice(colon + 1).trim();
    if (/^(payment-signature|x-payment)$/i.test(name)) {
      throw new UsageError("invalid_option", `${name} is managed by the x402 client`);
    }
    try {
      headers.append(name, fieldValue);
    } catch {
      throw new UsageError("invalid_value", `invalid HTTP header name or value: ${name}`);
    }
  }
  return headers;
}
