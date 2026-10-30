import type { BaseUnits } from "../../domain/amounts/index.js";
import type { CliError } from "../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { X402Scheme } from "../../domain/x402/families.js";

// A token the x402 integration registers for a scheme on a network.
export interface X402RegisteredAsset {
  readonly symbol: string;
  // Family-native contract address.
  readonly address: string;
  readonly decimals: number;
}

// What a paywall charges.
export interface X402PaywallTerms {
  readonly network: NetworkDescriptor;
  readonly scheme: X402Scheme;
  // Family-native contract address.
  readonly asset: string;
  readonly rawAmount: BaseUnits;
  readonly payTo: string;
  readonly validForSeconds: number;
  readonly facilitatorUrl: string;
}

// How the payer moves the asset; the integration picks it from the asset's registration.
export interface X402RequirementExtra {
  readonly assetTransferMethod?: "permit2";
  readonly name?: string;
  readonly version?: string;
}

// An x402 v2 payment requirement as a paywall publishes it.
export interface X402OfferedRequirement {
  readonly scheme: X402Scheme;
  // x402 network id as the facilitator spells it.
  readonly network: string;
  // Token base units.
  readonly amount: string;
  readonly asset: string;
  readonly payTo: string;
  readonly maxTimeoutSeconds: number;
  readonly extra: X402RequirementExtra;
}

export interface X402Challenge {
  readonly x402Version: 2;
  readonly error: string;
  readonly resource: { readonly url: string };
  readonly accepts: readonly X402OfferedRequirement[];
}

// The facilitator did not accept the payment; `error` is already classified for the payer.
export interface X402FacilitatorRefusal {
  readonly accepted: false;
  // True when the facilitator answered and refused; false when the call itself failed.
  readonly rejected: boolean;
  readonly error: CliError;
}

export type X402Verification = { readonly accepted: true } | X402FacilitatorRefusal;

export type X402SettlementOutcome =
  | {
      readonly accepted: true;
      readonly transaction: string;
      // Wire value of the payment-response header.
      readonly receiptHeader: string;
    }
  | X402FacilitatorRefusal;

// A requirement the facilitator agreed to serve.
export interface X402FacilitatorOffer {
  readonly requirement: X402OfferedRequirement;
  // Wire value of the payment-required header.
  encodeChallenge(challenge: X402Challenge): string;
  // `paymentSignature` is the payment-signature header value as received.
  verify(paymentSignature: string): Promise<X402Verification>;
  settle(paymentSignature: string): Promise<X402SettlementOutcome>;
}

export interface X402FacilitatorPort {
  // Matches the symbol in any case; undefined when no token is registered under it.
  assetBySymbol(
    network: NetworkDescriptor,
    scheme: X402Scheme,
    symbol: string,
  ): X402RegisteredAsset | undefined;
  assetByAddress(
    network: NetworkDescriptor,
    scheme: X402Scheme,
    address: string,
  ): X402RegisteredAsset | undefined;
  // Fails when the facilitator does not support the network and scheme.
  offer(terms: X402PaywallTerms): Promise<X402FacilitatorOffer>;
}
