import type { Sun } from "../../../domain/amounts/index.js";

// The gateway ABI-encodes parameters; callers supply typed values.
export interface ContractCallPayload {
  // Base58 address.
  readonly target: string;
  // Full signature, e.g. purchaseToken(address,uint256), not a selector.
  readonly method: string;
  readonly parameters: readonly ContractParameter[];
  // Absent for a pure token call.
  readonly callValueSun?: Sun;
}

// Struct values are arrays of member values.
export interface ContractParameter {
  readonly type: string;
  readonly value: string | readonly string[];
}
