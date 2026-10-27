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
  // Disambiguates standards sharing a write signature.
  approvalKind?: ApprovalKind;
  // {type,value} pairs for calls; positional values for deployments.
  params?: unknown[];
  // Native value in whole coins.
  callValue?: string;
  bytecode?: string;
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
