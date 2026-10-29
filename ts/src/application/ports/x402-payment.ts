import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { BroadcastGuard } from "../contracts/broadcast-guard.js";
import type {
  PayerSigner,
  Permit2Approver,
  SignedApproval,
  X402PaymentFacts,
} from "../contracts/x402-payer.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

export interface X402PayInput {
  url: string;
  method: string;
  headers: string[];
  body?: string | Uint8Array;
  token?: string;
  asset?: string;
  decimals?: number;
  scheme?: "exact" | "exact_gasfree";
  maxAmount?: string;
  maxRawAmount?: string;
  // Check against every offered x402 requirement.
  expectedPayTo?: string;
  exactAmount?: string;
  dryRun?: boolean;
  out?: string;
  gasfreeRelay?: string;
  maxGasfreeFee?: string;
  maxGasfreeFeeRaw?: string;
}

export type X402RequestInput = Omit<X402PayInput, "dryRun">;

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
  // Settlement receipt as the payment response header carried it.
  readonly paymentResponse?: X402Json;
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
}

export type X402Resource =
  | { kind: "response"; result: X402ResponseResult }
  | {
      kind: "payment-required";
      inspection: X402Inspection;
      facts: X402PaymentFacts;
      pay(capabilities: X402PaymentCapabilities): Promise<X402PaidResult>;
      close(): Promise<void>;
    };

export interface X402PaymentPort {
  /** Local configuration checks only; no signing or I/O. */
  validateConfiguration?(
    network: NetworkDescriptor,
    input: Pick<X402PayInput, "gasfreeRelay">,
  ): void;
  request(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402RequestInput,
  ): Promise<X402Resource>;
}
