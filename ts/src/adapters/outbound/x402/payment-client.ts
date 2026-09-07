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
import { decodePaymentRequiredHeader } from "@bankofai/x402-core/http";
import { writeFile } from "node:fs/promises";
import type { X402PayInput, X402PaymentPort } from "../../../application/ports/x402-payment.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { TransactionScope } from "../../../application/contracts/execution-scope.js";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";
import {
  CliError,
  ExecutionError,
  TransportError,
  UsageError,
} from "../../../domain/errors/index.js";
import { normalizeTypedData } from "../../../domain/typed-data/index.js";
import { toX402Wallet } from "./signer-bridge.js";
import { createPayerSigner } from "../../../application/services/x402/payer-signer.js";
import type { PayerSigner } from "../../../application/contracts/x402-payer.js";
import { toX402Network } from "../../../domain/x402/network-id.js";

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
    const requestInit: RequestInit = {
      method: input.method,
      headers,
      redirect: "error",
      ...(input.body === undefined ? {} : { body: input.body }),
    };
    try {
      if (this.paidFetchFactory && !input.expectedPayTo && input.exactAmount === undefined) {
        const signer = this.resolveSigner(scope, network);
        const paidFetch = await this.paidFetchFactory(network, signer, scope);
        return this.readResponse(
          input.url,
          await paidFetch(input.url, requestInit),
          signer,
          input.out,
        );
      }

      const boundedFetch = this.boundedFetch(scope);
      const initial = await boundedFetch(input.url, requestInit);
      if (initial.status !== 402)
        return this.readResponse(input.url, initial, undefined, input.out);
      if (input.dryRun) return inspectChallenge(input.url, initial, network, input);

      if (input.expectedPayTo || input.exactAmount !== undefined) {
        const challenge = await decodeChallenge(initial.clone());
        selectMatching(challenge.accepts, network, input);
      }

      const signer = createPayerSigner(this.signers, scope, network.family);
      const paidFetch = await this.createPaidFetch(network, signer, scope, input, initial);
      return this.readResponse(
        input.url,
        await paidFetch(input.url, requestInit),
        signer,
        input.out,
      );
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (error instanceof Error && /timeout|aborted/i.test(`${error.name} ${error.message}`)) {
        throw new TransportError("timeout", "x402 request timed out");
      }
      throw new TransportError("provider_error", "x402 request or payment failed");
    }
  }

  private async readResponse(
    url: string,
    response: Response,
    signer?: Pick<Signer, "address">,
    out?: string,
  ) {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new TransportError("response_too_large", "x402 response exceeds the 10 MB limit");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new TransportError("response_too_large", "x402 response exceeds the 10 MB limit");
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
    const base = {
      url,
      status: response.status,
      delivered: response.ok,
      settled: paymentResponse !== undefined,
      ...(signer ? { payer: { address: signer.address } } : {}),
      ...(paymentResponse === undefined ? {} : { paymentResponse }),
    };
    if (out) {
      await writeOutput(out, bytes);
      return { ...base, output: { path: out, bytes: bytes.byteLength } };
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
    return { ...base, response: body };
  }

  private async createPaidFetch(
    network: NetworkDescriptor,
    signer: PayerSigner,
    scope: TransactionScope,
    input: X402PayInput,
    initial: Response,
  ): Promise<typeof fetch> {
    let maxGasfreeFeeRaw = input.maxGasfreeFeeRaw;
    if (maxGasfreeFeeRaw === undefined && input.maxGasfreeFee !== undefined) {
      const challenge = await decodeChallenge(initial.clone());
      const selected = selectMatching(challenge.accepts, network, input)[0]!;
      maxGasfreeFeeRaw = decimalToRaw(
        input.maxGasfreeFee,
        input.decimals ?? tokenDecimals(network.id, selected.asset),
      );
    }
    const wallet = toX402Wallet(signer, { family: network.family, maxGasfreeFeeRaw });
    const bridge = {
      ...wallet,
      signTypedData: (payload: unknown) => wallet.signTypedData(normalizeTypedData(payload)),
      async signTransaction(tx: unknown): Promise<string | Record<string, unknown>> {
        const signed = await wallet.signTransaction(tx);
        if (typeof signed === "string") return signed;
        if (typeof signed === "object" && signed !== null && !Array.isArray(signed)) {
          return signed as Record<string, unknown>;
        }
        throw new ExecutionError(
          "signed_payload_mismatch",
          "signer returned no signed transaction",
        );
      },
    };
    const client = new x402Client();
    // The SDK's conservative default spend control remains active unless the caller supplied
    // an explicit wallet-cli ceiling. In that case our exact raw/human limit below is authoritative.
    if (input.maxAmount !== undefined || input.maxRawAmount !== undefined) {
      client.setSpendControls(false);
    }
    client.registerPolicy((_version, requirements) => selectMatching(requirements, network, input));
    const x402Network = toX402Network(network);
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
    const boundedFetch = this.boundedFetch(scope);
    let first: Response | undefined = initial;
    const fetchWithInitial: typeof fetch = (request, init) => {
      if (first) {
        const response = first;
        first = undefined;
        return Promise.resolve(response);
      }
      return boundedFetch(request, init);
    };
    return wrapFetchWithPayment(fetchWithInitial, client);
  }

  private boundedFetch(scope: TransactionScope): typeof fetch {
    return (request, init) =>
      this.fetcher(request, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(scope.timeoutMs),
      });
  }

  private resolveSigner(scope: TransactionScope, network: NetworkDescriptor): Signer {
    this.signers.assertCanSign(scope.activeAccount, network.family);
    return this.signers.resolve(scope.activeAccount, network.family);
  }
}

async function writeOutput(path: string, bytes: Uint8Array): Promise<void> {
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UsageError("output_exists", `output already exists: ${path}`);
    }
    throw new ExecutionError("io_error", `could not write x402 response to ${path}`);
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
  "eip155:8453": {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
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

interface OfferedRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  [key: string]: unknown;
}

function selectMatching<T extends OfferedRequirement>(
  requirements: T[],
  network: NetworkDescriptor,
  input: X402PayInput,
): T[] {
  const expectedNetwork =
    network.family === "tron" ? `tron:0x${BigInt(network.chainId).toString(16)}` : network.id;
  const matching = requirements.filter((requirement) => {
    if (requirement.network !== expectedNetwork) return false;
    if (requirement.scheme !== "exact" && requirement.scheme !== "exact_gasfree") return false;
    if (requirement.scheme === "exact_gasfree" && network.family !== "tron") return false;
    if (input.scheme && requirement.scheme !== input.scheme) return false;
    if (input.asset && requirement.asset.toLowerCase() !== input.asset.toLowerCase()) return false;
    if (input.token && tokenSymbol(network.id, requirement.asset) !== input.token.toUpperCase())
      return false;
    if (input.expectedPayTo) {
      if (typeof requirement.payTo !== "string") return false;
      const normalize = (address: string) =>
        network.family === "evm" ? address.toLowerCase() : address;
      if (normalize(requirement.payTo) !== normalize(input.expectedPayTo)) return false;
    }
    if (input.exactAmount !== undefined) {
      const expected = decimalToRaw(
        input.exactAmount,
        input.decimals ?? tokenDecimals(network.id, requirement.asset),
      );
      if (!/^\d+$/.test(requirement.amount) || BigInt(requirement.amount) !== BigInt(expected))
        return false;
    }
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
      : decimalToRaw(input.maxAmount, input.decimals ?? tokenDecimals(network.id, selected.asset)));
  if (limit !== undefined && BigInt(selected.amount) > BigInt(limit)) {
    throw new TransportError(
      "amount_exceeds_limit",
      "the x402 payment requirement exceeds the configured limit",
    );
  }
  // The SDK may reorder offers after policies run. Only expose the validated choice.
  return [selected];
}

async function inspectChallenge(
  url: string,
  response: Response,
  network: NetworkDescriptor,
  input: X402PayInput,
) {
  const decoded = await decodeChallenge(response.clone());
  const selected = selectMatching(decoded.accepts, network, input)[0]!;
  return {
    url,
    status: 402,
    delivered: false,
    settled: false,
    dryRun: true,
    paymentRequired: true,
    selected: { ...selected, network: network.id },
  };
}

async function decodeChallenge(response: Response): Promise<{ accepts: OfferedRequirement[] }> {
  let challenge: unknown;
  const header = response.headers.get("payment-required");
  try {
    challenge = header ? decodePaymentRequiredHeader(header) : await response.json();
  } catch {
    throw new TransportError(
      "invalid_x402_response",
      "could not decode the x402 payment challenge",
    );
  }
  if (!challenge || typeof challenge !== "object" || Array.isArray(challenge)) {
    throw new TransportError("invalid_x402_response", "x402 payment challenge must be an object");
  }
  const accepts = (challenge as { accepts?: unknown }).accepts;
  if (!Array.isArray(accepts)) {
    throw new TransportError("invalid_x402_response", "x402 payment challenge has no accepts list");
  }
  return { accepts: accepts.filter(isOfferedRequirement) };
}

function isOfferedRequirement(value: unknown): value is OfferedRequirement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ["scheme", "network", "amount", "asset"].every((field) => typeof item[field] === "string");
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
