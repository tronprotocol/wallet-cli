import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { BroadcastGuard } from "../contracts/broadcast-guard.js";
import type { PayerSigner, Permit2Approver, X402PaymentFacts } from "../contracts/x402-payer.js";
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

export type X402PaymentResult = Record<string, unknown>;

export interface X402PaymentCapabilities {
  readonly payer: PayerSigner;
  readonly approver: Permit2Approver;
  // Checked before any payment or approval leaves the process.
  readonly guard: BroadcastGuard;
}

export type X402Resource =
  | { kind: "response"; result: X402PaymentResult }
  | {
      kind: "payment-required";
      inspection: X402PaymentResult;
      facts: X402PaymentFacts;
      pay(capabilities: X402PaymentCapabilities): Promise<X402PaymentResult>;
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
