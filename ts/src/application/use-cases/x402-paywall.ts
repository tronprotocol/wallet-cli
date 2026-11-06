import {
  assertSubmitAdmitted,
  CommandDeadline,
  requestDispatchCheck,
  submitDispatchCheck,
} from "../services/command-deadline.js";
import type { DispatchCheck, ExecutionDeadline } from "../contracts/deadline.js";
import { addressCodec, CHAIN_FAMILIES } from "../../domain/family/index.js";
import { errorMessage, ExecutionError, inputRef, UsageError } from "../../domain/errors/index.js";
import type { BaseUnits } from "../../domain/amounts/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import { supportsScheme } from "../../domain/x402/families.js";
import {
  isPaymentDecimals,
  paymentBaseUnits,
  paymentRawAmount,
  paymentValidity,
  X402_MAX_TOKEN_DECIMALS,
} from "../../domain/x402/payment-terms.js";
import { defaultToken } from "../services/default-token.js";
import type {
  X402Discovery,
  X402OpenPaywall,
  X402Paywall,
  X402PaywallResponse,
} from "../contracts/x402-paywall.js";
import type {
  X402Challenge,
  X402FacilitatorOffer,
  X402FacilitatorPort,
  X402FacilitatorRefusal,
  X402PaywallTerms,
} from "../ports/x402-facilitator.js";
import type { X402ServeDetails, X402ServeInput } from "../ports/x402-server.js";

// Whole tokens a paywall charges when neither an amount nor a raw amount is given.
export const DEFAULT_PAYWALL_AMOUNT = "0.0001";

// Validated terms plus what serving reports about them.
export interface PaywallTerms extends X402PaywallTerms {
  readonly decimals: number;
  // Upper-case symbol; absent for an explicit asset.
  readonly token?: string;
  // Whole tokens, as given.
  readonly amount?: string;
  readonly resourceUrl?: string;
}

// Applies the paywall's amount, token, recipient and validity rules before any I/O.
export function paywallTerms(
  network: NetworkDescriptor,
  input: X402ServeInput,
  assets: Pick<X402FacilitatorPort, "assetBySymbol" | "assetByAddress">,
): PaywallTerms {
  if (!supportsScheme(network.family, input.scheme)) {
    throw new UsageError("invalid_value", "exact_gasfree is supported only on TRON");
  }
  if (input.maxGasfreeFee !== undefined && input.maxGasfreeFeeRaw !== undefined)
    throw new UsageError("invalid_option", "GasFree fee limits are mutually exclusive");
  if (input.maxGasfreeFeeRaw !== undefined)
    paymentRawAmount(input.maxGasfreeFeeRaw, "maxGasfreeFeeRaw");
  if (input.gasfreeRelay !== undefined) assertRelaySelection(input.gasfreeRelay);
  if (input.amount !== undefined && input.rawAmount !== undefined)
    throw new UsageError("invalid_option", "amount and raw amount are mutually exclusive");
  if (input.token !== undefined && input.asset !== undefined)
    throw new UsageError("invalid_option", "token and asset are mutually exclusive");
  if (input.decimals !== undefined && (!input.asset || !isPaymentDecimals(input.decimals)))
    throw new UsageError(
      "invalid_option",
      errorMessage`${inputRef("decimals")} requires ${inputRef("asset")} and must be from 0 to ${X402_MAX_TOKEN_DECIMALS}`,
    );
  const symbol = input.token ?? defaultToken("x402.serve", network.id);
  const known = input.asset
    ? assets.assetByAddress(network, input.scheme, input.asset)
    : assets.assetBySymbol(network, input.scheme, symbol);
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
  const asset = known ?? { address: input.asset!, decimals: input.decimals! };
  if (input.maxGasfreeFee !== undefined)
    paymentBaseUnits(input.maxGasfreeFee, asset.decimals, "maxGasfreeFee");
  assertPayTo(network, input.payTo);
  const validForSeconds = paymentValidity(input.validForSeconds, "validForSeconds");
  if (input.resourceUrl !== undefined) assertResourceUrl(input.resourceUrl);
  const rawAmount: BaseUnits =
    input.rawAmount !== undefined
      ? paymentRawAmount(input.rawAmount, "rawAmount")
      : paymentBaseUnits(input.amount ?? DEFAULT_PAYWALL_AMOUNT, asset.decimals, "amount");
  return {
    network,
    scheme: input.scheme,
    asset: asset.address,
    decimals: asset.decimals,
    rawAmount,
    payTo: input.payTo,
    validForSeconds,
    facilitatorUrl: input.facilitatorUrl,
    ...(input.token !== undefined
      ? { token: input.token.toUpperCase() }
      : input.asset === undefined
        ? { token: symbol }
        : {}),
    ...(input.amount === undefined ? {} : { amount: input.amount }),
    ...(input.resourceUrl === undefined ? {} : { resourceUrl: input.resourceUrl }),
  };
}

function assertRelaySelection(selection: string): void {
  if (selection === "official" || selection === "gasfree") return;
  let relay: URL;
  try {
    relay = new URL(selection);
  } catch {
    throw new UsageError("invalid_option", "GasFree relay must be official, gasfree or HTTPS");
  }
  if (relay.protocol !== "https:" || relay.username || relay.password || relay.search || relay.hash)
    throw new UsageError(
      "invalid_option",
      "GasFree relay must be HTTPS without credentials, query or fragment",
    );
}

function assertPayTo(network: NetworkDescriptor, payTo: string): void {
  if (addressCodec(network.family).validate(payTo)) return;
  const elsewhere = CHAIN_FAMILIES.some(
    (family) => family !== network.family && addressCodec(family).validate(payTo),
  );
  if (elsewhere)
    throw new UsageError(
      "family_mismatch",
      errorMessage`${inputRef("payTo")} belongs to a different chain family`,
    );
  throw new UsageError(
    "invalid_address",
    errorMessage`invalid ${network.family.toUpperCase()} ${inputRef("payTo")} address`,
  );
}

function assertResourceUrl(value: string): void {
  let resource: URL | undefined;
  try {
    resource = new URL(value);
  } catch {
    resource = undefined;
  }
  if (
    !resource ||
    !["http:", "https:"].includes(resource.protocol) ||
    resource.username ||
    resource.password
  )
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("resourceUrl")} must be HTTP(S) without credentials`,
    );
}

// Gives each payment request its deadline; dispose() runs when the request ends.
export type RequestDeadlines = () => { readonly deadline: ExecutionDeadline; dispose(): void };

// A server that lives on: every request gets its own deadline of `limitMs` (0 = unbounded).
export function freshRequestDeadlines(limitMs: number): RequestDeadlines {
  return () => {
    const deadline = new CommandDeadline(limitMs);
    return { deadline, dispose: () => deadline.dispose() };
  };
}

// A server inside one command: requests share the command's deadline.
export function sharedRequestDeadline(deadline: ExecutionDeadline): RequestDeadlines {
  return () => ({ deadline, dispose: () => {} });
}

export class Paywall implements X402Paywall {
  constructor(
    private readonly facilitator: Pick<X402FacilitatorPort, "offer">,
    readonly terms: PaywallTerms,
    private readonly requests: RequestDeadlines,
  ) {}

  async open(startup: ExecutionDeadline): Promise<X402OpenPaywall> {
    const offer = await this.facilitator.offer(this.terms, requestDispatchCheck(startup));
    return new OpenPaywall(offer, this.terms, this.requests);
  }
}

class OpenPaywall implements X402OpenPaywall {
  #payUrl = "";

  constructor(
    private readonly offer: X402FacilitatorOffer,
    private readonly terms: PaywallTerms,
    private readonly requests: RequestDeadlines,
  ) {}

  publish(payUrl: string): X402ServeDetails {
    this.#payUrl = payUrl;
    const { terms } = this;
    return {
      payUrl,
      network: terms.network.id,
      scheme: terms.scheme,
      ...(terms.token === undefined ? {} : { token: terms.token }),
      asset: terms.asset,
      decimals: terms.decimals,
      validForSeconds: terms.validForSeconds,
      resourceUrl: this.#resourceUrl(),
      ...(terms.amount === undefined ? {} : { amount: terms.amount }),
      rawAmount: terms.rawAmount,
      payTo: terms.payTo,
    };
  }

  discovery(): X402Discovery {
    return {
      x402Version: 2,
      resource: { url: this.#resourceUrl() },
      accepts: [this.offer.requirement],
    };
  }

  async handlePaymentRequest(
    paymentSignature: string | undefined,
    clientGone: AbortSignal,
  ): Promise<X402PaywallResponse> {
    if (paymentSignature === undefined) {
      const challenge: X402Challenge = { ...this.discovery(), error: "Payment required" };
      return {
        kind: "payment-required",
        challenge,
        challengeHeader: this.offer.encodeChallenge(challenge),
      };
    }
    const request = this.requests();
    try {
      const { deadline } = request;
      const verification = await this.offer.verify(
        paymentSignature,
        verifyCheck(deadline, clientGone),
      );
      if (!verification.accepted) return refused("verify", verification);
      const unsettled = settlementRefusal(deadline, clientGone);
      if (unsettled) return unsettled;
      // A disconnect does not abort a dispatched settlement: aborting cannot undo it.
      const settlement = await this.offer.settle(paymentSignature, submitDispatchCheck(deadline));
      if (!settlement.accepted) return refused("settle", settlement);
      return {
        kind: "paid",
        receiptHeader: settlement.receiptHeader,
        body: {
          success: true,
          network: this.terms.network.id,
          scheme: this.terms.scheme,
          transaction: settlement.transaction,
        },
      };
    } finally {
      request.dispose();
    }
  }

  #resourceUrl(): string {
    return this.terms.resourceUrl ?? this.#payUrl;
  }
}

function refused(phase: "verify" | "settle", refusal: X402FacilitatorRefusal): X402PaywallResponse {
  return { kind: "refused", phase, rejected: refusal.rejected, error: refusal.error };
}

const NOT_SETTLED = { phase: "settle", paymentStatus: "not_sent", retryPayment: false } as const;

function verifyCheck(deadline: ExecutionDeadline, clientGone: AbortSignal): DispatchCheck {
  return {
    signal: AbortSignal.any([deadline.signal, clientGone]),
    assertDispatchable: () => {
      deadline.assertActive();
      if (clientGone.aborted) throw clientGoneError();
    },
  };
}

// Settlement starts only with the admission reserve left and the client still connected.
function settlementRefusal(
  deadline: ExecutionDeadline,
  clientGone: AbortSignal,
): X402PaywallResponse | undefined {
  try {
    assertSubmitAdmitted(deadline);
  } catch {
    return {
      kind: "refused",
      phase: "settle",
      rejected: false,
      error: new ExecutionError(
        "timeout",
        "the request's time limit ran out before settlement; nothing was settled",
        NOT_SETTLED,
      ),
    };
  }
  if (!clientGone.aborted) return undefined;
  return { kind: "refused", phase: "settle", rejected: false, error: clientGoneError() };
}

function clientGoneError(): ExecutionError {
  return new ExecutionError(
    "aborted",
    "the client disconnected before settlement; nothing was settled",
    NOT_SETTLED,
  );
}
