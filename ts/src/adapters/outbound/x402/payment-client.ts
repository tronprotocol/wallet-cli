import { gasfreeRelayClient } from "./gasfree-relay.js";
import type { Config } from "../../../domain/types/index.js";
import { X402_TOKENS, GASFREE_TOKENS, tokensForScheme } from "./tokens.js";
import {
  unsentPaymentError,
  sdkPaymentError,
  providerPaymentError,
  type PaymentPhase,
} from "./payment-error.js";
import { successfulSettlement } from "./settlement.js";
import { boundedResponse, fetchBounded, MAX_HTTP_RESPONSE_BYTES } from "../http/http-response.js";
import {
  x402Client,
  wrapFetchWithPayment,
  decodePaymentResponseHeader,
} from "@bankofai/x402-fetch";
import { registerExactEvmScheme } from "@bankofai/x402-evm/exact/client";
import {
  createClientTronSigner,
  registerToken,
  PERMIT2_ADDRESSES,
  getPermit2AllowanceReadParams,
  type ClientTronSigner,
} from "@bankofai/x402-tron";
import { registerExactTronScheme } from "@bankofai/x402-tron/exact/client";
import { registerExactGasFreeTronScheme } from "@bankofai/x402-tron/gasfree/client";
import { PERMIT2_ADDRESS as EVM_PERMIT2_ADDRESS, type ClientEvmSigner } from "@bankofai/x402-evm";
import { EvmAddress } from "../../../domain/address/index.js";
import type { Network } from "@bankofai/x402-core/types";
import { decodePaymentRequiredHeader } from "@bankofai/x402-core/http";
import { open, unlink, type FileHandle } from "node:fs/promises";
import type {
  X402Inspection,
  X402Json,
  X402RequestInput,
  X402Requirement,
  X402Resource,
  X402ResponseResult,
  X402PaymentPort,
} from "../../../application/ports/x402-payment.js";
import type { TransactionScope } from "../../../application/contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import {
  ExecutionError,
  TransportError,
  UsageError,
  type CliError,
} from "../../../domain/errors/index.js";
import type {
  Permit2Approver,
  SignedApproval,
  X402PaymentFacts,
} from "../../../application/contracts/x402-payer.js";
import { normalizeTypedData } from "../../../domain/typed-data/index.js";
import { toX402Wallet } from "./signer-bridge.js";
import { silenceX402SdkLogs } from "./sdk-logs.js";
import type { PayerSigner } from "../../../application/contracts/x402-payer.js";
import { toX402Network, sameX402Network } from "../../../domain/x402/network-id.js";
import { fromBaseUnits } from "../../../domain/amounts/index.js";
import { sameAddress, type ChainFamily } from "../../../domain/family/index.js";

type PaidFetchFactory = (
  network: NetworkDescriptor,
  signer: PayerSigner,
  scope: TransactionScope,
) => Promise<typeof fetch>;

const MAX_RESPONSE_BYTES = MAX_HTTP_RESPONSE_BYTES;

export class X402PaymentClient implements X402PaymentPort {
  constructor(
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly paidFetchFactory?: PaidFetchFactory,
    private readonly config: Pick<Config, "gasfreeApiKey" | "gasfreeApiSecret"> = {},
  ) {
    silenceX402SdkLogs();
  }

  validateConfiguration(
    network: NetworkDescriptor,
    input: Pick<X402RequestInput, "gasfreeRelay">,
  ): void {
    gasfreeRelayClient(network, input.gasfreeRelay, this.config, 60000, this.fetcher);
  }

  async request(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402RequestInput,
  ): Promise<X402Resource> {
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
      ...(input.body === undefined
        ? {}
        : { body: typeof input.body === "string" ? input.body : new Uint8Array(input.body) }),
    };
    scope.emit({
      type: "activity",
      message: "Requesting the resource and checking payment requirements…",
    });
    const authorization: PaymentAuthorization = { signed: false };
    let phase: PaymentPhase = "request";
    let out: OutputReservation | undefined;
    try {
      // Reserve --out before payment so an existing file cannot prevent delivery after settlement.
      if (input.out !== undefined) out = await reserveOutput(input.out);
      const boundedFetch = this.boundedFetch(scope, network);
      const initial = await boundedFetch(input.url, requestInit);
      if (initial.status !== 402)
        return {
          kind: "response",
          result: await this.readResponse(
            input.url,
            initial,
            undefined,
            out,
            toX402Network(network),
          ),
        };
      phase = "challenge";
      scope.emit({
        type: "activity",
        message: "Payment required (HTTP 402); checking network, asset and payment limits…",
      });
      const inspection = await inspectChallenge(input.url, initial, network, input);
      return {
        kind: "payment-required",
        inspection,
        facts: paymentFacts(network),
        close: async () => {
          await out?.release();
        },
        pay: async ({ payer: signer, approver, guard }) => {
          guard.assertAllowed();
          phase = "create_payment";
          try {
            let paidFetch: typeof fetch;
            if (this.paidFetchFactory) {
              // External fetch factories own their signing lifecycle.
              authorization.signed = true;
              paidFetch = await this.paidFetchFactory(network, signer, scope);
            } else {
              paidFetch = await this.createPaidFetch(
                network,
                signer,
                approver,
                scope,
                input,
                initial,
                relay,
                authorization,
              );
            }
            phase = "payment_request";
            scope.emit({ type: "activity", message: "Preparing payment for the service…" });
            const response = await paidFetch(input.url, requestInit);
            let bounded: Response;
            try {
              bounded = this.paidFetchFactory
                ? await boundedResponse(response, MAX_RESPONSE_BYTES)
                : response;
            } catch (error) {
              throw settlementError(error, response, toX402Network(network), signer);
            }
            const result = await this.readResponse(
              input.url,
              bounded,
              signer,
              out,
              toX402Network(network),
            );
            return {
              ...result,
              ...(authorization.requirement
                ? { payment: paidAmount(network, authorization.requirement, input) }
                : {}),
              ...(authorization.approval ? { approval: authorization.approval } : {}),
            };
          } catch (error) {
            const classified = authorization.signed
              ? sdkPaymentError(error, phase)
              : unsentPaymentError(error, phase);
            throw withApproval(classified, authorization.approval);
          }
        },
      };
    } catch (error) {
      await out?.release();
      throw unsentPaymentError(error, phase);
    }
  }

  private async readResponse(
    url: string,
    response: Response,
    signer?: Pick<PayerSigner, "address">,
    out?: OutputReservation,
    expectedNetwork?: string,
  ): Promise<X402ResponseResult> {
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
      const receipt =
        paymentResponse && typeof paymentResponse === "object" && !Array.isArray(paymentResponse)
          ? (paymentResponse as Record<string, unknown>)
          : undefined;
      // A well-formed negative receipt is a settlement failure, not invalid evidence.
      const failed =
        receipt?.success === false &&
        typeof receipt.network === "string" &&
        sameX402Network(receipt.network, expectedNetwork ?? receipt.network) &&
        typeof receipt.transaction === "string" &&
        (receipt.errorReason === undefined || typeof receipt.errorReason === "string");
      const failure = providerPaymentError(
        failed ? receipt.errorReason : undefined,
        "settle",
        receipt,
      );
      throw new TransportError(
        failed ? failure.code : "invalid_settlement",
        failed ? failure.message : "paid endpoint returned an invalid settlement receipt",
        {
          httpStatus: response.status,
          settled: false,
          delivered: response.ok,
          retryPayment: false,
          ...failure.details,
        },
      );
    }
    const base = {
      url,
      status: response.status,
      delivered: response.ok,
      settled: successfulSettlement(paymentResponse, expectedNetwork),
      ...(signer ? { payer: { address: signer.address } } : {}),
      ...(paymentResponse === undefined ? {} : { paymentResponse: paymentResponse as X402Json }),
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
        await out.write(bytes);
        return { ...base, output: { path: out.path, bytes: bytes.byteLength } };
      }
      const contentType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]!
        .trim()
        .toLowerCase();
      const responseDetails = {
        phase: "response",
        paymentStatus: signer ? "unknown" : "not_sent",
        retryPayment: false,
        httpStatus: response.status,
        delivered: response.ok,
        settled: false,
      };
      if (isBinaryContentType(contentType)) {
        throw new UsageError(
          "invalid_option",
          "binary response requires --out to save its bytes; check payment details before any further payment",
          responseDetails,
        );
      }
      let text: string;
      try {
        // Unknown MIME types still require valid UTF-8.
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new TransportError(
          "invalid_x402_response",
          "endpoint returned invalid UTF-8; --out is required to save raw bytes; check payment details before any further payment",
          responseDetails,
        );
      }
      let body: unknown = text;
      if ((contentType === "application/json" || contentType.endsWith("+json")) && text !== "") {
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
      return { ...base, response: body as X402Json };
    } catch (error) {
      throw settlementError(error, response, expectedNetwork, signer);
    }
  }

  private async createPaidFetch(
    network: NetworkDescriptor,
    signer: PayerSigner,
    approver: Permit2Approver,
    scope: TransactionScope,
    input: X402RequestInput,
    initial: Response,
    relay: ReturnType<typeof gasfreeRelayClient>,
    authorization: PaymentAuthorization,
  ): Promise<typeof fetch> {
    const recordApproval = (
      approval: SignedApproval,
      status: NonNullable<PaymentAuthorization["approval"]>["status"],
    ) => {
      authorization.approval = { ...approval, status };
      scope.warn(
        `Permit2 approval ${approval.txId} signed for ${approval.token} (unlimited allowance to ${approval.spender}); check it on-chain before approving again`,
      );
    };
    const wallet = toX402Wallet(signer, {
      family: network.family,
      feeCapped: input.maxGasfreeFeeRaw !== undefined || input.maxGasfreeFee !== undefined,
      // The SDK signs a sponsored approval only to export it in the payment package.
      onApprovalSigned: (approval) => recordApproval(approval, "exported"),
      warn: (message) => scope.warn(message),
    });
    const bridge = {
      ...wallet,
      async signTypedData(payload: unknown) {
        scope.emit({ type: "activity", message: "Signing payment authorization…" });
        try {
          const signed = await wallet.signTypedData(normalizeTypedData(payload));
          authorization.signed = true;
          scope.emit({
            type: "activity",
            message:
              "Payment authorization signed; continuing payment verification and settlement…",
          });
          return signed;
        } catch (error) {
          throw sdkPaymentError(error, "sign");
        }
      },
      async signTransaction(tx: unknown): Promise<string | Record<string, unknown>> {
        scope.emit({ type: "activity", message: "Signing the payment transaction…" });
        const signed = await wallet.signTransaction(tx).catch((error: unknown) => {
          throw sdkPaymentError(error, "sign");
        });
        // Track TRON approvals separately from payment authorization.
        if (network.family === "evm") authorization.signed = true;
        scope.emit({
          type: "activity",
          message: "Payment transaction signed; continuing payment verification and settlement…",
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
    // An explicit CLI ceiling replaces the SDK spend control.
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
      // SDK metadata is keyed by symbol: use an internal alias to retain exact's USDD entry.
      for (const [symbol, token] of Object.entries(GASFREE_TOKENS[network.id] ?? {})) {
        registerToken(network.id as Network, { ...token, symbol: `${symbol}_GASFREE` });
      }
      const sdkSigner = await createClientTronSigner(bridge, {
        network: x402Network,
        ...(network.httpEndpoint ? { rpcUrl: network.httpEndpoint } : {}),
        ...(network.apiKey ? { apiKey: network.apiKey } : {}),
        allowanceMode: "skip",
      });
      // The SDK must never broadcast: a missing allowance is approved through the application.
      const tronSigner: ClientTronSigner = {
        ...sdkSigner,
        ensureAllowance: async ({ token, amount }) => {
          const spender = PERMIT2_ADDRESSES[x402Network];
          if (!spender) {
            throw new Error(`No Permit2 contract address configured for network ${x402Network}`);
          }
          const readAllowance = async () =>
            String(
              await sdkSigner.readContract(
                getPermit2AllowanceReadParams({
                  network: x402Network,
                  tokenAddress: token,
                  ownerAddress: signer.address,
                }) as Parameters<ClientTronSigner["readContract"]>[0],
              ),
            );
          const current = BigInt(await readAllowance());
          if (current >= amount) return true;
          const strategy = sdkSigner.approvalPolicy?.strategyFor(x402Network, token);
          // The SDK's own reason strings, so these classify like the SDK's approval path.
          if (strategy === "unsupported") throw new Error("approval_asset_unsupported");
          if (current !== 0n && strategy === "zero-first")
            throw new Error("approval_reset_required");
          const approval = await approver.approve({
            token,
            spender,
            requiredAllowance: amount.toString(),
            readAllowance,
          });
          recordApproval(approval, "confirmed");
          return true;
        },
      };
      registerExactTronScheme(client, {
        signer: tronSigner,
        networks: [network.id as Network],
      });
      registerExactGasFreeTronScheme(client, {
        schemeOptions: relay ? { apiClients: { [network.id]: relay } } : undefined,
        signer: tronSigner,
        networks: [network.id as Network],
      });
    }
    // Preserve typed wallet/SDK errors before x402-fetch wraps them in a plain Error.
    let creationError: unknown;
    client.onPaymentCreationFailure(async ({ error }) => {
      creationError = sdkPaymentError(error, "create_payment");
    });
    // Record the requirement used to create the payment.
    client.onAfterPaymentCreation(async ({ selectedRequirements }) => {
      authorization.requirement = selectedRequirements;
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
    signer?: Pick<PayerSigner, "address">,
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
}

function isBinaryContentType(contentType: string): boolean {
  return (
    /^(?:image|audio|video|font)\//.test(contentType) ||
    /^application\/(?:octet-stream|pdf|zip|gzip|x-gzip|x-tar|x-bzip2|x-7z-compressed|x-rar-compressed|vnd\.rar|wasm|cbor|protobuf|x-protobuf)$/.test(
      contentType,
    )
  );
}

const evmAddress = new EvmAddress();

function paymentFacts(network: NetworkDescriptor): X402PaymentFacts {
  const tokens = Object.values(X402_TOKENS[network.id] ?? {}).map((t) => t.address);
  const tronSpender =
    network.family === "tron" ? PERMIT2_ADDRESSES[toX402Network(network)] : undefined;
  const permit2 =
    network.family === "evm"
      ? {
          spender: evmAddress.canonical(EVM_PERMIT2_ADDRESS),
          tokens: tokens.map((token) => evmAddress.canonical(token)),
        }
      : tronSpender && { spender: tronSpender, tokens };
  return {
    ...(permit2 ? { permit2 } : {}),
    tokenDecimals: (token) => metadata(network.id, token)?.decimals,
  };
}

interface PaymentAuthorization {
  // Excludes TRON approval signatures.
  signed: boolean;
  // Signed Permit2 approval and SDK progress.
  approval?: SignedApproval & { status: "confirmed" | "exported" };
  requirement?: { asset: string; amount: string };
}

function paidAmount(
  network: NetworkDescriptor,
  requirement: { asset: string; amount: string },
  input: X402RequestInput,
) {
  const known = metadata(network.id, requirement.asset);
  // An explicit --decimals is only accepted beside --asset, which this requirement matched.
  const decimals = known?.decimals ?? input.decimals;
  return {
    asset: requirement.asset,
    ...(known ? { token: known.symbol } : {}),
    ...(decimals === undefined
      ? {}
      : { decimals, amount: fromBaseUnits(requirement.amount, decimals) }),
    rawAmount: requirement.amount,
  };
}

function withApproval(error: CliError, approval: PaymentAuthorization["approval"]): CliError {
  if (!approval) return error;
  const ErrorType = error.kind === "usage" ? UsageError : TransportError;
  return new ErrorType(error.code, error, { ...error.details, approval });
}

interface OutputReservation {
  readonly path: string;
  // Successful writes survive release().
  write(bytes: Uint8Array): Promise<void>;
  // Remove an unwritten reservation.
  release(): Promise<void>;
}

async function reserveOutput(path: string): Promise<OutputReservation> {
  let handle: FileHandle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UsageError("output_exists", `output already exists: ${path}`);
    }
    throw new ExecutionError("io_error", `could not create x402 output ${path}`);
  }
  let written = false;
  return {
    path,
    async write(bytes) {
      try {
        await handle.writeFile(bytes);
        written = true;
        await handle.close();
      } catch {
        throw new ExecutionError("io_error", `could not write x402 response to ${path}`);
      }
    },
    async release() {
      if (written) return;
      await handle.close().catch(() => {});
      await unlink(path).catch(() => {});
    },
  };
}

function metadata(network: string, asset: string) {
  const tokens = X402_TOKENS[network] ?? {};
  const entry = [...Object.entries(tokens), ...Object.entries(GASFREE_TOKENS[network] ?? {})].find(
    ([, token]) => sameAddress(x402Family(network), token.address, asset),
  );
  return entry ? { ...entry[1], symbol: entry[0] } : undefined;
}

function tokenSymbol(network: string, asset: string, scheme: string): string | undefined {
  return Object.entries(tokensForScheme(network, scheme)).find(([, token]) =>
    sameAddress(x402Family(network), token.address, asset),
  )?.[0];
}

const x402Family = (network: string): ChainFamily =>
  network.startsWith("eip155:") ? "evm" : "tron";

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
  input: X402RequestInput,
): T[] {
  // Raw limits require a pinned asset to define their unit.
  if (input.maxRawAmount !== undefined && !input.asset && !input.token) {
    throw new UsageError(
      "invalid_option",
      "--max-raw-amount requires --token or --asset; a raw limit has no unit, so pin it to one token or use --max-amount",
    );
  }
  const expectedNetwork =
    network.family === "tron" ? `tron:0x${BigInt(network.chainId).toString(16)}` : network.id;
  const matching = requirements.filter((requirement) => {
    if (!sameX402Network(requirement.network, expectedNetwork)) return false;
    if (requirement.scheme !== "exact" && requirement.scheme !== "exact_gasfree") return false;
    if (requirement.scheme === "exact_gasfree" && network.family !== "tron") return false;
    if (input.scheme && requirement.scheme !== input.scheme) return false;
    if (input.asset && !sameAddress(network.family, requirement.asset, input.asset)) return false;
    if (
      input.token &&
      tokenSymbol(network.id, requirement.asset, requirement.scheme) !== input.token.toUpperCase()
    )
      return false;
    if (input.expectedPayTo) {
      if (typeof requirement.payTo !== "string") return false;
      if (!sameAddress(network.family, requirement.payTo, input.expectedPayTo)) return false;
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
  input: X402RequestInput,
): Promise<X402Inspection> {
  const decoded = await decodeChallenge(response.clone());
  const selected = selectMatching(decoded.accepts, network, input)[0]!;
  return {
    url,
    status: 402,
    delivered: false,
    settled: false,
    dryRun: true,
    paymentRequired: true,
    selected: { ...selected, network: network.id } as X402Requirement,
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

// Preserve settlement headers when reading the response fails.
function settlementError(
  error: unknown,
  response?: Response,
  expectedNetwork?: string,
  signer?: Pick<PayerSigner, "address">,
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
  return new ErrorType(classified.code, classified, {
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
