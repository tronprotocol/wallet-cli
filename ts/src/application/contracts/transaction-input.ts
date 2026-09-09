import type { DeployConstructorArgs } from "../ports/chain/gateway-provider.js";

export type ApprovalKind = "erc721";

export interface TransactionModeInput {
  dryRun?: boolean;
  signOnly?: boolean;
  buildOnly?: boolean;
  permissionId?: number;
  expiration?: number;
}

export interface EvmContractWriteInput extends TransactionModeInput {
  contract?: string;
  method?: string;
  /** disambiguates standards that share a write signature. */
  approvalKind?: ApprovalKind;
  /** `{type,value}` entries for a call; raw positional values for a deployment. */
  params?: unknown[];
  /** native coin sent along with the call, in whole coins (as `tx send --amount` is). */
  callValue?: string;
  bytecode?: string;
  /** how the constructor's arguments are typed and what they are; see DeployConstructorArgs. */
  constructorArgs?: DeployConstructorArgs;
  gasLimit?: string;
  maxFee?: string;
  priorityFee?: string;
  nonce?: number;
}

export interface GovernanceTransactionInput extends TransactionModeInput {
  expiration?: number;
  permissionId?: number;
}
