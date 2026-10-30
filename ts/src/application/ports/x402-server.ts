import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { X402PaymentResult, X402Settlement } from "./x402-payment.js";

export interface X402RoundtripPort {
  prepare(scope: TransactionScope, network: NetworkDescriptor): void;
  validate(network: NetworkDescriptor, input: X402ServeInput): void;
  roundtrip(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402ServeInput,
  ): Promise<X402Roundtrip>;
}

export interface X402Roundtrip {
  readonly serve: X402ServeDetails;
  readonly pay: X402PaymentResult;
  // Present when the paid response carried a settlement receipt.
  readonly settlement?: X402Settlement;
}

// How the listener reports requests: as JSON lines, text lines, or debug diagnostics.
export type X402AccessLog = "json" | "text" | "diagnostic";

// Amounts: amount in whole tokens, rawAmount in token base units.
export interface X402ServeInput {
  // Defaults to JSON lines; a roundtrip always reports diagnostics.
  accessLog?: X402AccessLog;
  payTo: string;
  amount?: string;
  rawAmount?: string;
  token?: string;
  asset?: string;
  decimals?: number;
  resourceUrl?: string;
  validForSeconds?: number;
  daemon?: boolean;
  dryRun?: boolean;
  scheme: "exact" | "exact_gasfree";
  host: string;
  port: number;
  facilitatorUrl: string;
  gasfreeRelay?: string;
  maxGasfreeFee?: string;
  maxGasfreeFeeRaw?: string;
}

// Amounts: amount in whole tokens, rawAmount in token base units.
export interface X402ServeDetails {
  payUrl: string;
  network: string;
  scheme: "exact" | "exact_gasfree";
  token?: string;
  asset: string;
  decimals: number;
  validForSeconds: number;
  resourceUrl: string;
  amount?: string;
  rawAmount: string;
  payTo: string;
  // Set for a detached server.
  daemon?: true;
  pid?: number;
  logFile?: string;
}

export interface X402ServerHandle {
  details: X402ServeDetails;
  close(): Promise<void>;
}
