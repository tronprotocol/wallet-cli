import { gasfreeRelayClient } from "./gasfree-relay.js";
import type { Config } from "../../../domain/types/index.js";
import { X402_TOKENS } from "./tokens.js";
import { sdkPaymentError, providerPaymentError, type PaymentPhase } from "./payment-error.js";
import { successfulSettlement } from "./settlement.js";
import { boundedResponse, fetchBounded, MAX_HTTP_RESPONSE_BYTES } from "../http/http-response.js";
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
import { ExecutionError, TransportError, UsageError } from "../../../domain/errors/index.js";
import { normalizeTypedData } from "../../../domain/typed-data/index.js";
import { toX402Wallet } from "./signer-bridge.js";
import { createPayerSigner } from "../../../application/services/x402/payer-signer.js";
import type { PayerSigner } from "../../../application/contracts/x402-payer.js";
import { toX402Network, sameX402Network } from "../../../domain/x402/network-id.js";

type PaidFetchFactory = (
  network: NetworkDescriptor,
  signer: Signer,
  scope: TransactionScope,
) => Promise<typeof fetch>;

const MAX_RESPONSE_BYTES = MAX_HTTP_RESPONSE_BYTES;

export class X402PaymentClient implements X402PaymentPort {
  constructor(
    private readonly signers: SignerResolver,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly paidFetchFactory?: PaidFetchFactory,
    private readonly config: Pick<Config, "gasfreeApiKey" | "gasfreeApiSecret"> = {},
  ) {}

  async pay(scope: TransactionScope, network: NetworkDescriptor, input: X402PayInput) {
    if (input.asset && input.decimals !== undefined)
      paymentDecimals(network.id, input.asset, input.decimals);
    if (input.maxRawAmount !== undefined) requireRawAmount(input.maxRawAmount);
    if (
      input.maxAmount !== undefined &&
      (!/^\d+(?:\.\d+)?$/.test(input.maxAmount) || !/[1-9]/.test(input.maxAmount))
    )
      throw new UsageError("invalid_amount", "payment limit must be positive");
    const relay = gasfreeRelayClient(
      network,
      input.gasfreeRelay,
      this.config,
      scope.timeoutMs,
      this.fetcher,
    );
    const headers = parseHeaders(input.headers);
    const requestInit: RequestInit = {
      method: input.method,
      headers,
      redirect: "error",
      ...(input.body === undefined ? {} : { body: input.body }),
    };
    let phase: PaymentPhase = "request";
    try {
      if (this.paidFetchFactory && !input.expectedPayTo && input.exactAmount === undefined) {
        const signer = this.resolveSigner(scope, network);
        const paidFetch = await this.paidFetchFactory(network, signer, scope);
        const response = await paidFetch(input.url, requestInit);
        let bounded: Response;
        try {
          bounded = await boundedResponse(response, MAX_RESPONSE_BYTES);
        } catch (error) {
          throw settlementError(error, response, toX402Network(network), signer);
        }
        return await this.readResponse(
          input.url,
          bounded,
          signer,
          input.out,
          toX402Network(network),
        );
      }

      const boundedFetch = this.boundedFetch(scope, network);
      const initial = await boundedFetch(input.url, requestInit);
      if (initial.status !== 402)
        return await this.readResponse(
          input.url,
          initial,
          undefined,
          input.out,
          toX402Network(network),
        );
      phase = "challenge";
      if (input.dryRun) return inspectChallenge(input.url, initial, network, input);

      if (input.expectedPayTo || input.exactAmount !== undefined) {
        const challenge = await decodeChallenge(initial.clone());
        selectMatching(challenge.accepts, network, input);
      }

      phase = "create_payment";
      const signer = createPayerSigner(this.signers, scope, network.family);
      const paidFetch = await this.createPaidFetch(network, signer, scope, input, initial, relay);
      phase = "payment_request";
      return await this.readResponse(
        input.url,
        await paidFetch(input.url, requestInit),
        signer,
        input.out,
        toX402Network(network),
      );
    } catch (error) {
      throw sdkPaymentError(error, phase);
    }
  }

  private async readResponse(
    url: string,
    response: Response,
    signer?: Pick<Signer, "address">,
    out?: string,
    expectedNetwork?: string,
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
    if (paymentHeader && !successfulSettlement(paymentResponse, expectedNetwork)) {
      throw new TransportError(
        "invalid_settlement",
        "paid endpoint returned an invalid settlement receipt",
        {
          httpStatus: response.status,
          settled: false,
          delivered: response.ok,
          retryPayment: false,
          ...providerPaymentError(
            undefined,
            "settle",
            paymentResponse && typeof paymentResponse === "object"
              ? (paymentResponse as Record<string, unknown>)
              : undefined,
          ).details,
        },
      );
    }
    const base = {
      url,
      status: response.status,
      delivered: response.ok,
      settled: successfulSettlement(paymentResponse, expectedNetwork),
      ...(signer ? { payer: { address: signer.address } } : {}),
      ...(paymentResponse === undefined ? {} : { paymentResponse }),
    };
    try {
      if (!response.ok && !base.settled) {
        let failure: Record<string, unknown> = {};
        try {
          failure = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          /* Not a structured failure. */
        }
        if (signer && failure && (failure.phase === "verify" || failure.phase === "settle"))
          throw providerPaymentError(failure.reason ?? failure.code, failure.phase, failure);
        const limited =
          response.status === 429 ||
          (failure && failure.error === "facilitator /settle failed with HTTP 429");
        throw new TransportError(
          limited ? "provider_rate_limited" : "provider_error",
          limited
            ? "x402 provider is rate limited; wait before retrying and reconcile payment status"
            : `x402 endpoint returned HTTP ${response.status}`,
          {
            httpStatus: response.status,
            settled: false,
            delivered: false,
            retryPayment: false,
          },
        );
      }
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
          throw new TransportError(
            "invalid_x402_response",
            "paid endpoint returned malformed JSON",
          );
        }
      }
      if (!response.ok && signer && body && typeof body === "object" && !base.settled) {
        const failure = body as Record<string, unknown>;
        if (failure.phase === "verify" || failure.phase === "settle") {
          throw providerPaymentError(failure.reason ?? failure.code, failure.phase, failure);
        }
      }
      return { ...base, response: body };
    } catch (error) {
      throw settlementError(error, response, expectedNetwork, signer);
    }
  }

  private async createPaidFetch(
    network: NetworkDescriptor,
    signer: PayerSigner,
    scope: TransactionScope,
    input: X402PayInput,
    initial: Response,
    relay: ReturnType<typeof gasfreeRelayClient>,
  ): Promise<typeof fetch> {
    let maxGasfreeFeeRaw = input.maxGasfreeFeeRaw;
    if (maxGasfreeFeeRaw === undefined && input.maxGasfreeFee !== undefined) {
      const challenge = await decodeChallenge(initial.clone());
      const selected = selectMatching(challenge.accepts, network, input)[0]!;
      maxGasfreeFeeRaw = decimalToRaw(
        input.maxGasfreeFee,
        paymentDecimals(network.id, selected.asset, input.decimals),
      );
    }
    const wallet = toX402Wallet(signer, {
      family: network.family,
      maxGasfreeFeeRaw,
      warn: (message) => scope.warn(message),
    });
    const bridge = {
      ...wallet,
      async signTypedData(payload: unknown) {
        try {
          return await wallet.signTypedData(normalizeTypedData(payload));
        } catch (error) {
          throw sdkPaymentError(error, "sign");
        }
      },
      async signTransaction(tx: unknown): Promise<string | Record<string, unknown>> {
        const signed = await wallet.signTransaction(tx).catch((error: unknown) => {
          throw sdkPaymentError(error, "sign");
        });
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
        networks: [network.id as Network],
        schemeOptions: network.httpEndpoint ? { rpcUrl: network.httpEndpoint } : undefined,
      });
    } else {
      const tronSigner = await createClientTronSigner(bridge, {
        network: x402Network,
        ...(network.httpEndpoint ? { rpcUrl: network.httpEndpoint } : {}),
        ...(network.apiKey ? { apiKey: network.apiKey } : {}),
        allowanceMode: "auto",
      });
      registerExactTronScheme(client, {
        signer: tronSigner as ClientTronSigner,
        networks: [network.id as Network],
      });
      registerExactGasFreeTronScheme(client, {
        schemeOptions: relay ? { apiClients: { [network.id]: relay } } : undefined,
        signer: tronSigner as ClientTronSigner,
        networks: [network.id as Network],
      });
    }
    // Preserve typed wallet/SDK errors before x402-fetch wraps them in a plain Error.
    let creationError: unknown;
    client.onPaymentCreationFailure(async ({ error }) => {
      creationError = sdkPaymentError(error, "create_payment");
    });
    const boundedFetch = this.boundedFetch(scope, network, signer);
    let first: Response | undefined = initial;
    const fetchWithInitial: typeof fetch = (request, init) => {
      if (first) {
        const response = first;
        first = undefined;
        return Promise.resolve(response);
      }
      return boundedFetch(request, init);
    };
    const paidFetch = wrapFetchWithPayment(fetchWithInitial, client);
    return async (request, init) => {
      try {
        return await paidFetch(request, init);
      } catch (error) {
        throw creationError ?? error;
      }
    };
  }

  private boundedFetch(
    scope: TransactionScope,
    network: NetworkDescriptor,
    signer?: Pick<Signer, "address">,
  ): typeof fetch {
    return async (request, init) => {
      let response: Response | undefined;
      const fetcher: typeof fetch = async (url, options) => {
        response = await this.fetcher(url, options);
        return response;
      };
      try {
        return await fetchBounded(fetcher, request, init, scope.timeoutMs);
      } catch (error) {
        throw settlementError(error, response, toX402Network(network), signer);
      }
    };
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

function metadata(network: string, asset: string) {
  const tokens = X402_TOKENS[network] ?? {};
  const entry = Object.entries(tokens).find(([, token]) =>
    network.startsWith("eip155:")
      ? token.address.toLowerCase() === asset.toLowerCase()
      : token.address === asset,
  );
  return entry ? { ...entry[1], symbol: entry[0] } : undefined;
}

function tokenSymbol(network: string, asset: string): string | undefined {
  return metadata(network, asset)?.symbol;
}

function paymentDecimals(network: string, asset: string, explicit?: number): number {
  const known = metadata(network, asset)?.decimals;
  if (explicit !== undefined && (!Number.isInteger(explicit) || explicit < 0 || explicit > 18))
    throw new UsageError("invalid_value", "explicit decimals must be an integer from 0 to 18");
  if (explicit !== undefined && known !== undefined && known !== explicit)
    throw new UsageError(
      "invalid_option",
      "explicit decimals must match the registered token precision",
    );
  return known ?? explicit ?? tokenDecimals(network, asset);
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
  if (!/^\d+(?:\.\d+)?$/.test(value) || value.length > 100)
    throw new UsageError("invalid_amount", "amount must be a decimal string");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new UsageError("invalid_amount", `amount supports at most ${decimals} decimal places`);
  const raw = (
    BigInt(whole!) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  ).toString();
  requireRawAmount(raw, true);
  return raw;
}
function requireRawAmount(value: string, allowZero = false): void {
  if (
    !/^\d+$/.test(value) ||
    value.length > 78 ||
    BigInt(value) < (allowZero ? 0n : 1n) ||
    BigInt(value) >= 1n << 256n
  )
    throw new UsageError("invalid_amount", "amount must fit uint256 and be positive");
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
    if (!sameX402Network(requirement.network, expectedNetwork)) return false;
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
        paymentDecimals(network.id, requirement.asset, input.decimals),
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
  requireRawAmount(selected.amount);
  if (input.decimals !== undefined) paymentDecimals(network.id, selected.asset, input.decimals);
  const limit =
    input.maxRawAmount ??
    (input.maxAmount === undefined
      ? undefined
      : decimalToRaw(input.maxAmount, paymentDecimals(network.id, selected.asset, input.decimals)));
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

/** A response/body failure must not discard settlement already received in headers. */
function settlementError(
  error: unknown,
  response?: Response,
  expectedNetwork?: string,
  signer?: Pick<Signer, "address">,
) {
  const classified = sdkPaymentError(error);
  const header =
    response?.headers.get("payment-response") ?? response?.headers.get("x-payment-response");
  let receipt: unknown;
  try {
    if (header) receipt = decodePaymentResponseHeader(header);
  } catch {
    return classified;
  }
  if (!successfulSettlement(receipt, expectedNetwork)) return classified;
  const settlement = receipt as Record<string, unknown>;
  const ErrorType = classified.kind === "usage" ? UsageError : TransportError;
  return new ErrorType(classified.code, classified.message, {
    ...classified.details,
    phase: "response",
    paymentStatus: "settled",
    retryPayment: false,
    settled: true,
    txHash: settlement.transaction,
    paymentResponse: {
      success: true,
      network: settlement.network,
      transaction: settlement.transaction,
    },
    ...(signer ? { payer: { address: signer.address } } : {}),
  });
}
