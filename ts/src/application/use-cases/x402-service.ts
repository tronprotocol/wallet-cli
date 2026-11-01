import { createPayerSigner, preparePayerSigner } from "../services/x402/payer-signer.js";
import type { SignerResolver } from "../services/signer/index.js";
import type { SigningService } from "../services/signing/signing-service.js";
import { processBroadcastGuard } from "../services/broadcast-guard.js";
import type { Permit2Approver, X402PaymentFacts } from "../contracts/x402-payer.js";
import type { X402Permit2Approvals } from "./x402-permit2-approval.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import {
  errorMessage,
  ExecutionError,
  inputRef,
  TransportError,
  UsageError,
  type CliError,
} from "../../domain/errors/index.js";
import { baseUnitAmount, type BaseUnits } from "../../domain/amounts/index.js";
import {
  isPaymentDecimals,
  paymentBaseUnits,
  paymentRawAmount,
} from "../../domain/x402/payment-terms.js";
import type { ExecutionDeadline } from "../contracts/deadline.js";
import {
  assertSubmitAdmitted,
  requestDispatchCheck,
  submitDispatchCheck,
} from "../services/command-deadline.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { X402PaywallHost } from "../contracts/x402-paywall.js";
import type { ProviderCatalogPort, ProviderListInput } from "../ports/provider-catalog.js";
import type { X402FacilitatorPort } from "../ports/x402-facilitator.js";
import type {
  X402Inspection,
  X402PaidResult,
  X402PaymentPort,
  X402PaymentRequest,
  X402PaymentResult,
  X402ResponseResult,
} from "../ports/x402-payment.js";
import type { X402Roundtrip, X402ServeInput } from "../ports/x402-server.js";
import {
  freshRequestDeadlines,
  Paywall,
  paywallTerms,
  sharedRequestDeadline,
} from "./x402-paywall.js";

import type { NetworkRegistry } from "../ports/network-registry.js";

// A payment request with the payer's ceilings; amounts named raw are token base units.
export interface X402PayRequest extends X402PaymentRequest {
  // Whole tokens of the selected asset.
  readonly maxAmount?: string;
  // Requires `token` or `asset`, which give it a unit.
  readonly maxRawAmount?: string;
  // Inspect the challenge without signing.
  readonly dryRun?: boolean;
  // Whole tokens of the token the GasFree payload names.
  readonly maxGasfreeFee?: string;
  readonly maxGasfreeFeeRaw?: string;
}

// The settlement receipt is reported as `paymentResponse`; its normalized form stays internal.
export type X402PayResult =
  X402Inspection | Omit<X402ResponseResult, "settlement"> | Omit<X402PaidResult, "settlement">;

// A local paywall: its facilitator and the HTTP host that serves it.
export interface X402PaywallRuntime {
  readonly facilitator: X402FacilitatorPort;
  readonly host: X402PaywallHost;
  // The resolved command duration; each request of a long-lived server gets this much (0 = no limit).
  readonly requestTimeoutMs: number;
}

export class X402Service {
  constructor(
    private readonly payments: X402PaymentPort,
    private readonly signers: SignerResolver,
    private readonly catalog: ProviderCatalogPort,
    private readonly networks: Pick<NetworkRegistry, "resolve">,
    private readonly paywalls?: X402PaywallRuntime,
    private readonly approvals?: Pick<X402Permit2Approvals, "approver">,
    private readonly signing?: Pick<SigningService, "sign">,
  ) {}

  prepare(scope: TransactionScope, network: NetworkDescriptor): void {
    preparePayerSigner(this.signers, scope, network.family);
  }

  async pay(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402PayRequest,
  ): Promise<X402PayResult> {
    return withoutSettlement(await this.#pay(scope, network, input));
  }

  async #pay(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402PayRequest,
  ): Promise<X402PaymentResult> {
    const {
      dryRun,
      maxAmount: _maxAmount,
      maxRawAmount: _maxRawAmount,
      maxGasfreeFee,
      maxGasfreeFeeRaw,
      ...request
    } = input;
    const facts = this.payments.facts(network);
    const rawLimit = checkedLimits(input, facts);
    const resource = await this.payments.request(
      scope,
      network,
      request,
      requestDispatchCheck(scope.deadline),
    );
    if (resource.kind === "response") return resource.result;
    try {
      const limit = appliedLimit(resource.inspection, input, facts, rawLimit);
      if (dryRun) return resource.inspection;
      const payer = createPayerSigner(this.signers, this.#signing(), scope, network, {
        family: network.family,
        ...(maxGasfreeFeeRaw === undefined ? {} : { maxGasfreeFeeRaw }),
        ...(maxGasfreeFee === undefined ? {} : { maxGasfreeFee }),
        gasfreeFeeDecimals: (token) => facts.tokenDecimals(token),
        // Only the Permit2 approval a payment needs may be signed as a transaction.
        ...(facts.permit2 ? { approveIntent: facts.permit2 } : {}),
      });
      assertSubmitAdmitted(scope.deadline);
      return await resource.pay({
        payer,
        approver: this.#approver(scope, network, facts),
        guard: processBroadcastGuard,
        submit: submitDispatchCheck(scope.deadline),
        limits: {
          ...(limit === undefined ? {} : { maxRawAmount: limit }),
          gasfreeFeeCapped: maxGasfreeFee !== undefined || maxGasfreeFeeRaw !== undefined,
        },
      });
    } finally {
      await resource.close();
    }
  }

  #signing(): Pick<SigningService, "sign"> {
    if (this.signing) return this.signing;
    return {
      sign: async () => {
        throw new ExecutionError(
          "internal_error",
          "no signing entry is wired to the x402 service; nothing was signed",
        );
      },
    };
  }

  #approver(
    scope: TransactionScope,
    network: NetworkDescriptor,
    facts: X402PaymentFacts,
  ): Permit2Approver {
    if (this.approvals) return this.approvals.approver(scope, network, facts);
    return {
      approve: async () => {
        throw new ExecutionError(
          "internal_error",
          "no Permit2 approval path is wired to the x402 service; nothing was submitted",
        );
      },
    };
  }

  providerList(deadline: ExecutionDeadline, input: ProviderListInput) {
    const network = input.network;
    // Explicit chain IDs need no configured RPC; resolve aliases through the network registry.
    const canonical =
      network && !/^(?:tron|eip155):(?:[0-9]+|0x[0-9a-f]+)$/i.test(network)
        ? this.networks.resolve(network).id
        : network;
    return this.catalog.list(
      {
        ...input,
        ...(canonical === undefined ? {} : { network: canonical }),
      },
      requestDispatchCheck(deadline),
    );
  }

  providerShow(deadline: ExecutionDeadline, fqn: string) {
    return this.catalog.show(fqn, requestDispatchCheck(deadline));
  }

  providerEndpoints(deadline: ExecutionDeadline, fqn: string) {
    return this.catalog.endpoints(fqn, requestDispatchCheck(deadline));
  }

  providerUpdate(deadline: ExecutionDeadline) {
    return this.catalog.update(requestDispatchCheck(deadline));
  }

  validate(network: NetworkDescriptor, input: X402ServeInput): void {
    paywallTerms(network, input, this.#paywalls().facilitator);
    this.payments.validateConfiguration?.(network, input);
  }

  async serve(deadline: ExecutionDeadline, network: NetworkDescriptor, input: X402ServeInput) {
    const { facilitator, host, requestTimeoutMs } = this.#paywalls();
    const paywall = new Paywall(
      facilitator,
      paywallTerms(network, input, facilitator),
      freshRequestDeadlines(requestTimeoutMs),
    );
    const handle = await host.start(
      paywall,
      {
        host: input.host,
        port: input.port,
        accessLog: input.accessLog ?? "json",
        daemon: input.daemon ?? false,
        persistent: true,
      },
      deadline,
    );
    return handle.details;
  }

  async roundtrip(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402ServeInput,
  ): Promise<X402Roundtrip> {
    const { facilitator, host } = this.#paywalls();
    const paywall = new Paywall(
      facilitator,
      paywallTerms(network, input, facilitator),
      sharedRequestDeadline(scope.deadline),
    );
    const handle = await host.start(
      paywall,
      {
        host: input.host,
        port: input.port,
        accessLog: "diagnostic",
        daemon: false,
        persistent: false,
      },
      scope.deadline,
    );
    try {
      const served = handle.details;
      const result = await this.#pay(scope, network, {
        url: served.payUrl,
        method: "GET",
        headers: [],
        ...(input.token === undefined ? {} : { token: input.token }),
        scheme: input.scheme,
        expectedPayTo: input.payTo,
        // Pin the route to the asset this paywall serves; a raw limit has no unit of its own.
        asset: input.asset ?? served.asset,
        ...(input.decimals === undefined ? {} : { decimals: input.decimals }),
        exactRawAmount: baseUnitAmount(served.rawAmount),
        maxRawAmount: served.rawAmount,
        ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
        ...(input.gasfreeRelay === undefined ? {} : { gasfreeRelay: input.gasfreeRelay }),
        ...(input.maxGasfreeFee === undefined ? {} : { maxGasfreeFee: input.maxGasfreeFee }),
        ...(input.maxGasfreeFeeRaw === undefined
          ? {}
          : { maxGasfreeFeeRaw: input.maxGasfreeFeeRaw }),
      });
      const settlement = "settlement" in result ? result.settlement : undefined;
      return {
        serve: served,
        pay: withoutSettlement(result),
        ...(settlement === undefined ? {} : { settlement }),
      };
    } finally {
      await handle.close();
    }
  }

  #paywalls(): X402PaywallRuntime {
    if (!this.paywalls) throw new Error("x402 server is not available in this runtime");
    return this.paywalls;
  }
}

function withoutSettlement(result: X402PaymentResult): X402PayResult {
  if (!("settlement" in result)) return result;
  const { settlement: _settlement, ...rest } = result;
  return rest;
}

// The challenge has not been answered, so nothing was paid.
const NOT_SENT = { phase: "challenge", paymentStatus: "not_sent", retryPayment: false } as const;

// Checks the request's ceilings and asset precision before any request; returns a raw ceiling.
function checkedLimits(input: X402PayRequest, facts: X402PaymentFacts): BaseUnits | undefined {
  if (input.asset !== undefined && input.decimals !== undefined) {
    if (!isPaymentDecimals(input.decimals))
      throw new UsageError(
        "invalid_value",
        errorMessage`explicit ${inputRef("decimals")} must be an integer from 0 to 18`,
      );
    const known = facts.tokenDecimals(input.asset);
    if (known !== undefined && known !== input.decimals)
      throw new UsageError(
        "invalid_option",
        "explicit decimals must match the registered token precision",
      );
  }
  if (input.maxAmount !== undefined && !/^\d+(?:\.\d+)?$/.test(input.maxAmount))
    throw new UsageError("invalid_amount", errorMessage`${inputRef("maxAmount")} must be positive`);
  if (input.maxAmount !== undefined && !/[1-9]/.test(input.maxAmount))
    throw new UsageError("invalid_amount", errorMessage`${inputRef("maxAmount")} must be positive`);
  if (input.maxRawAmount === undefined) return undefined;
  const limit = paymentRawAmount(input.maxRawAmount, "maxRawAmount");
  // Pin raw limits to a token so the seller cannot choose their units.
  if (input.token === undefined && input.asset === undefined)
    throw new UsageError(
      "invalid_option",
      errorMessage`${inputRef("maxRawAmount")} requires ${inputRef("token")} or ${inputRef("asset")}; a raw limit has no unit, so pin it to one token or use ${inputRef("maxAmount")}`,
      { paymentStatus: "not_sent", retryPayment: false },
    );
  return limit;
}

// Refuses a selected requirement above the ceiling; a whole-token ceiling uses the selected asset's precision.
function appliedLimit(
  inspection: X402Inspection,
  input: X402PayRequest,
  facts: X402PaymentFacts,
  rawLimit: BaseUnits | undefined,
): BaseUnits | undefined {
  const selected = inspection.selected;
  const limit = rawLimit ?? wholeTokenLimit(selected.asset, input, facts);
  if (limit !== undefined && BigInt(selected.amount) > BigInt(limit))
    throw new TransportError(
      "amount_exceeds_limit",
      "the x402 payment requirement exceeds the configured limit",
      NOT_SENT,
    );
  return limit;
}

function wholeTokenLimit(
  asset: string,
  input: X402PayRequest,
  facts: X402PaymentFacts,
): BaseUnits | undefined {
  if (input.maxAmount === undefined) return undefined;
  const decimals = facts.tokenDecimals(asset) ?? input.decimals;
  if (decimals === undefined)
    throw notSent(
      new UsageError(
        "invalid_option",
        errorMessage`${inputRef("maxAmount")} requires a known token or explicit ${inputRef("decimals")}`,
      ),
    );
  try {
    return paymentBaseUnits(input.maxAmount, decimals, "maxAmount");
  } catch (error) {
    throw notSent(error as CliError);
  }
}

function notSent(error: CliError): CliError {
  const ErrorType = error.kind === "usage" ? UsageError : TransportError;
  return new ErrorType(error.code, error.userMessage, { ...error.details, ...NOT_SENT });
}
