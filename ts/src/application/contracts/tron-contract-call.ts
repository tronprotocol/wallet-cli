import type { BaseUnits, Sun } from "../../domain/amounts/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

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

export type ApprovalDomain = "sunpump-launchpad" | "sunswap-contracts";

export interface ApprovalCapablePort {
  // Brand prevents wiring an approval sequence to another protocol's contracts.
  readonly approvalDomain: ApprovalDomain;

  // Allowance in token base units.
  allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
  ): Promise<BaseUnits>;

  approvalPayload(
    network: NetworkDescriptor,
    token: string,
    spender: string,
    amount: BaseUnits,
  ): ContractCallPayload;
}
