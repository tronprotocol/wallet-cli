import type { NetworkDescriptor, TronTransactionArtifact } from "../../domain/types/index.js";

export interface TronLinkListFilter {
  state: number;
  isSigned?: boolean;
  start: number;
  limit: number;
}

/** Untrusted wire record. Application code validates every field before using or rendering it. */
export interface TronLinkRemoteRecord {
  hash: unknown;
  contract_type: unknown;
  state: unknown;
  is_sign: unknown;
  current_weight: unknown;
  threshold: unknown;
  contract_data: unknown;
  originator_address: unknown;
  current_transaction: unknown;
  signature_progress: unknown;
}

export interface TronLinkRemotePage {
  total: number;
  records: TronLinkRemoteRecord[];
}

/** Outbound boundary for the official walletadapter REST/WebSocket collaboration service. */
export interface TronLinkCollaborationPort {
  list(
    network: NetworkDescriptor,
    address: string,
    filter: TronLinkListFilter,
  ): Promise<TronLinkRemotePage>;
  /** Opens a collection when the transaction is new, and accumulates onto it thereafter. */
  submit(
    network: NetworkDescriptor,
    address: string,
    transaction: TronTransactionArtifact,
  ): Promise<void>;
  watch(
    network: NetworkDescriptor,
    address: string,
    signal: AbortSignal,
    onMessage: (payload: unknown) => void,
  ): Promise<void>;
}
