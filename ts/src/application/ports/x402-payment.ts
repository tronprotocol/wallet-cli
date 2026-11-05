import type { DispatchCheck } from "../contracts/deadline.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { BroadcastGuard } from "../contracts/broadcast-guard.js";
import type {
  PayerSigner,
  Permit2Approver,
  SignedApproval,
  X402PaymentFacts,
} from "../contracts/x402-payer.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { BaseUnits } from "../../domain/amounts/index.js";
import type { X402Scheme } from "../../domain/x402/families.js";

export interface HttpHeader {
  readonly name: string;
  readonly value: string;
}

// The request to an x402 endpoint and the offers its payment may accept; the first match is selected.
export interface X402PaymentRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: readonly HttpHeader[];
  readonly body?: string | Uint8Array;
  // New file for the response bytes, chosen by the user.
  readonly out?: string;
  readonly scheme?: X402Scheme;
  // Registered token symbol.
  readonly token?: string;
  // Family-native asset address.
  readonly asset?: string;
  // Precision of `asset` when the registry does not know it.
  readonly decimals?: number;
  readonly expectedPayTo?: string;
  readonly exactRawAmount?: BaseUnits;
  // official, gasfree, or an HTTPS relay URL.
  readonly gasfreeRelay?: string;
}

// Ceilings the payer set for the selected requirement.
export interface X402PayerLimits {
  // Absent leaves the SDK's built-in spend control in force.
  readonly maxRawAmount?: BaseUnits;
  // The asset `maxRawAmount` was converted for; a requirement in any other asset is refused.
  readonly limitAsset?: string;
  // The payer signer enforces the GasFree fee ceiling; this only records that one is set.
  readonly gasfreeFeeCapped: boolean;
}

// The settlement receipt a paid endpoint returned. A field whose wire type is wrong is absent,
// except `payer`, which keeps such a value as its JSON text so it never matches an address.
export interface X402Settlement {
  // True only when the receipt says success: true.
  readonly success: boolean;
  // x402 network id as reported.
  readonly network?: string;
  readonly transaction?: string;
  readonly payer?: string;
}

// JSON as the endpoint returned it.
export type X402Json =
  string | number | boolean | null | readonly X402Json[] | { readonly [field: string]: X402Json };

// The payment requirement this request selected, as the endpoint offered it.
export interface X402Requirement {
  readonly scheme: string;
  readonly network: string;
  // Token base units.
  readonly amount: string;
  readonly asset: string;
  readonly [field: string]: X402Json;
}

export interface X402Inspection {
  readonly url: string;
  readonly status: 402;
  readonly delivered: false;
  readonly settled: false;
  readonly dryRun: true;
  readonly paymentRequired: true;
  readonly selected: X402Requirement;
}

export interface X402ResponseResult {
  readonly url: string;
  readonly status: number;
  readonly delivered: boolean;
  readonly settled: boolean;
  readonly payer?: { readonly address: string };
  // Settlement receipt as the payment response header carried it, for display.
  readonly paymentResponse?: X402Json;
  // The same receipt, normalized.
  readonly settlement?: X402Settlement;
  // Present when the body was written to a file instead of returned.
  readonly output?: { readonly path: string; readonly bytes: number };
  // Parsed JSON for a JSON content type, otherwise the text.
  readonly response?: X402Json;
}

export interface X402PaidAmount {
  readonly asset: string;
  readonly token?: string;
  readonly decimals?: number;
  // Whole tokens; present when decimals are known.
  readonly amount?: string;
  // Token base units.
  readonly rawAmount: string;
}

export interface X402PaidResult extends X402ResponseResult {
  readonly payment?: X402PaidAmount;
  readonly approval?: SignedApproval & { readonly status: "confirmed" | "exported" };
}

export type X402PaymentResult = X402ResponseResult | X402Inspection | X402PaidResult;

export interface X402PaymentCapabilities {
  readonly payer: PayerSigner;
  readonly approver: Permit2Approver;
  // Checked before any payment or approval leaves the process.
  readonly guard: BroadcastGuard;
  // Runs immediately before the paid request is sent, after signing and any approval.
  readonly submit: DispatchCheck;
  readonly limits: X402PayerLimits;
}

export type X402Resource =
  | { kind: "response"; result: X402ResponseResult }
  | {
      kind: "payment-required";
      inspection: X402Inspection;
      pay(capabilities: X402PaymentCapabilities): Promise<X402PaidResult>;
      close(): Promise<void>;
    };

export interface X402PaymentPort {
  /** Local configuration checks only; no signing or I/O. */
  validateConfiguration?(
    network: NetworkDescriptor,
    input: Pick<X402PaymentRequest, "gasfreeRelay">,
  ): void;
  facts(network: NetworkDescriptor): X402PaymentFacts;
  request(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402PaymentRequest,
    check: DispatchCheck,
  ): Promise<X402Resource>;
}
