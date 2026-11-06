import type { DispatchCheck } from "../contracts/deadline.js";
import type { CliError } from "../../domain/errors/index.js";
import type {
  NetworkDescriptor,
  TronLinkSignatureProgressView,
  TronProtocolValue,
  TronTransactionArtifact,
} from "../../domain/types/index.js";

export interface TronLinkListFilter {
  state: "all" | "open" | "success" | "failed";
  isSigned?: boolean;
  start: number;
  limit: number;
}

// TronLink's claims, parsed but not yet checked against the transaction bytes or the chain.
export interface TronLinkRemoteRecord {
  // Lowercase hex without 0x.
  txId: string;
  contractType: string;
  // "open" still collects signatures.
  status: "open" | "success" | "failed";
  // Whether the queried address has signed.
  signed: boolean;
  currentWeight: number;
  threshold: number;
  ownerAddress: string;
  originatorAddress: string;
  signatureProgress: TronLinkSignatureProgressView[];
  // The transaction JSON exactly as TronLink sent it; null when absent.
  currentTransaction: TronProtocolValue;
}

// A malformed row stays in the page so a lookup of another transaction can skip it.
export type TronLinkRemoteEntry =
  | { kind: "record"; claimedTxId: string | null; record: TronLinkRemoteRecord }
  | { kind: "malformed"; claimedTxId: string | null; error: CliError };

export interface TronLinkRemotePage {
  total: number;
  entries: TronLinkRemoteEntry[];
}

export interface TronLinkCollaborationPort {
  list(
    network: NetworkDescriptor,
    address: string,
    filter: TronLinkListFilter,
    check: DispatchCheck,
  ): Promise<TronLinkRemotePage>;
  // Creates a collection or accumulates signatures onto an existing one.
  submit(
    network: NetworkDescriptor,
    address: string,
    transaction: TronTransactionArtifact,
    check: DispatchCheck,
  ): Promise<void>;
  // Reports, per notification, how many open records the address has not signed. `stop` ends the
  // watch normally; when `check` refuses or its signal aborts, the watch fails with that error.
  watch(
    network: NetworkDescriptor,
    address: string,
    stop: AbortSignal,
    check: DispatchCheck,
    onUnsignedCount: (count: number) => void,
  ): Promise<void>;
}
