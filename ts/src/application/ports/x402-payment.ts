import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

export interface X402PayInput {
  url: string;
  method: string;
  headers: string[];
  body?: string;
  token?: string;
  asset?: string;
  decimals?: number;
  scheme?: "exact" | "exact_gasfree";
  maxAmount?: string;
  maxRawAmount?: string;
  /** Internal payment constraints, enforced against every offered x402 requirement. */
  expectedPayTo?: string;
  exactAmount?: string;
  dryRun?: boolean;
  out?: string;
  maxGasfreeFee?: string;
  maxGasfreeFeeRaw?: string;
}

export interface X402PaymentPort {
  pay(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: X402PayInput,
  ): Promise<Record<string, unknown>>;
}
