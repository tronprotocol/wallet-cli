import { addressCodec, CHAIN_FAMILIES } from "../../domain/family/index.js";
import { errorMessage, inputRef, UsageError } from "../../domain/errors/index.js";
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

export class Paywall implements X402Paywall {
  constructor(
    private readonly facilitator: Pick<X402FacilitatorPort, "offer">,
    readonly terms: PaywallTerms,
  ) {}

  async open(): Promise<X402OpenPaywall> {
    return new OpenPaywall(await this.facilitator.offer(this.terms), this.terms);
  }
}

class OpenPaywall implements X402OpenPaywall {
  #payUrl = "";

  constructor(
    private readonly offer: X402FacilitatorOffer,
    private readonly terms: PaywallTerms,
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

  async handlePaymentRequest(paymentSignature: string | undefined): Promise<X402PaywallResponse> {
    if (paymentSignature === undefined) {
      const challenge: X402Challenge = { ...this.discovery(), error: "Payment required" };
      return {
        kind: "payment-required",
        challenge,
        challengeHeader: this.offer.encodeChallenge(challenge),
      };
    }
    const verification = await this.offer.verify(paymentSignature);
    if (!verification.accepted) return refused("verify", verification);
    const settlement = await this.offer.settle(paymentSignature);
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
  }

  #resourceUrl(): string {
    return this.terms.resourceUrl ?? this.#payUrl;
  }
}

function refused(phase: "verify" | "settle", refusal: X402FacilitatorRefusal): X402PaywallResponse {
  return { kind: "refused", phase, rejected: refusal.rejected, error: refusal.error };
}
