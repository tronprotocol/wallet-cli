import type { NetworkDescriptor, TronTransactionArtifact } from "../../domain/types/index.js";

export interface TronLinkListFilter {
  state: number;
  isSigned?: boolean;
  start: number;
  limit: number;
}

// Untrusted wire fields require validation before use or rendering.
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

export interface TronLinkCollaborationPort {
  list(
    network: NetworkDescriptor,
    address: string,
    filter: TronLinkListFilter,
  ): Promise<TronLinkRemotePage>;
  // Creates a collection or accumulates signatures onto an existing one.
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
