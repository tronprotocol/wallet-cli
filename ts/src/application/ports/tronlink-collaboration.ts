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

export interface TronLinkCreateRequest {
  permissionName: string;
  txId: string;
  rawDataJson: string;
  contractType: string;
}

/** Outbound boundary for the official walletadapter REST/WebSocket collaboration service. */
export interface TronLinkCollaborationPort {
  list(
    network: NetworkDescriptor,
    address: string,
    filter: TronLinkListFilter,
  ): Promise<TronLinkRemotePage>;
  create(
    network: NetworkDescriptor,
    address: string,
    request: TronLinkCreateRequest,
  ): Promise<void>;
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
