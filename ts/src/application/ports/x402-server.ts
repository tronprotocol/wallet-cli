import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { X402PaymentResult } from "./x402-payment.js";

export interface X402RoundtripPort {
  prepare(scope: TransactionScope, network: NetworkDescriptor): void;
  validate(network: NetworkDescriptor, input: X402ServeInput): void;
  roundtrip(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402ServeInput,
  ): Promise<{ serve: X402ServeDetails; pay: X402PaymentResult }>;
}

export interface X402ServeInput {
  // Temporary roundtrip logs are diagnostic; standalone server access logs persist.
  accessLog?: "debug" | "text";
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

export interface X402ServerPort {
  validate(network: NetworkDescriptor, input: X402ServeInput): void;
  start(network: NetworkDescriptor, input: X402ServeInput): Promise<X402ServerHandle>;
}
