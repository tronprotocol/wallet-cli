import type { NetworkDescriptor } from "../../domain/types/index.js";

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
  start(network: NetworkDescriptor, input: X402ServeInput): Promise<X402ServerHandle>;
}
