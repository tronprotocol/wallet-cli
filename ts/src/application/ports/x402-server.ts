import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

export interface X402RoundtripPort {
  validate(network: NetworkDescriptor, input: X402ServeInput): void;
  roundtrip(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402ServeInput,
  ): Promise<{ serve: Record<string, unknown>; pay: Record<string, unknown> }>;
}

export interface X402ServeInput {
  payTo: string;
  amount: string;
  token: string;
  scheme: "exact" | "exact_gasfree";
  host: string;
  port: number;
  facilitatorUrl: string;
}

export interface X402ServerHandle {
  details: Record<string, unknown>;
  close(): Promise<void>;
}

export interface X402ServerPort {
  validate(network: NetworkDescriptor, input: X402ServeInput): void;
  start(network: NetworkDescriptor, input: X402ServeInput): Promise<X402ServerHandle>;
}
