import type {
  CheckedTxSignView,
  NetworkDescriptor,
  OfflineTxSignView,
  TxApprovalView,
} from "../../../domain/types/index.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";

export interface TronSignOptions {
  // "imported" checks the transaction's reference block on the network's node before signing.
  origin: "imported" | "offline";
  // Require the signer that passed authorization, before any signing interaction.
  expectedSigner?: string;
}

// Appends the active account's signature to a hex transaction without permission checks.
export interface TronHexSigner {
  sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
    options: TronSignOptions,
  ): Promise<OfflineTxSignView>;
}

// Signs only after the node confirms the signer holds the transaction's permission.
export interface TronCheckedSigner {
  approvals(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    hex: string,
  ): Promise<TxApprovalView>;
  signChecked(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
  ): Promise<CheckedTxSignView>;
}
