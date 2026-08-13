export interface ApprovedSignerView {
  address: string;
  weight: number;
}

export interface TxApprovalView {
  txId: string;
  contractType: string;
  operation?: string;
  from?: string;
  to?: string;
  rawAmount?: string;
  tokenContract?: string;
  permission: {
    id: number;
    name: string;
    threshold: number;
  };
  currentWeight: number;
  missingWeight: number;
  thresholdReached: boolean;
  approved: ApprovedSignerView[];
  expiration: number;
  expired: boolean;
  signatures: number;
}

export interface TxSignTransactionView {
  txId: string;
  contractType: string;
  operation?: string;
  from?: string;
  to?: string;
  rawAmount?: string;
  tokenContract?: string;
  permissionId: number;
  expiration: number;
  expired: boolean;
  signatures: number;
}

interface TxSignViewBase {
  kind: "tx-sign";
  signer: string;
  hex: string;
  out?: string;
  transaction: TxSignTransactionView;
}

export interface OfflineTxSignView extends TxSignViewBase {
  checked: false;
}

export interface CheckedTxSignView extends TxSignViewBase {
  checked: true;
  signerWeight: number;
  approval: TxApprovalView;
}

export type TxSignView = OfflineTxSignView | CheckedTxSignView;

export type TronLinkMultisigState = "pending" | "signed" | "success" | "failed";

export interface TronLinkSignatureProgressView {
  address: string;
  weight: number;
  signed: boolean;
  signedAt: number | null;
}

/** Validated projection of an untrusted TronLink collaboration record. */
export interface TronLinkMultisigTransactionView {
  txId: string;
  state: TronLinkMultisigState;
  contractType: string;
  originator: string;
  owner: string;
  permission: {
    id: number;
    name: string;
    threshold: number;
  };
  currentWeight: number;
  missingWeight: number;
  thresholdReached: boolean;
  awaitingMySignature: boolean;
  signedByCurrentAccount: boolean;
  createdAt: number;
  expiration: number;
  expired: boolean;
  signatures: number;
  signatureProgress: TronLinkSignatureProgressView[];
  from?: string;
  to?: string;
  rawAmount?: string;
}

export interface TronLinkMultisigListView {
  address: string;
  total: number;
  transactions: TronLinkMultisigTransactionView[];
}

export interface TronLinkMultisigCreateView {
  action: "create";
  accepted: true;
  hex: string;
  transaction: TxApprovalView;
}

export interface TronLinkMultisigSignView {
  action: "sign";
  accepted: true;
  signer: string;
  signerWeight: number;
  hex: string;
  transaction: TxApprovalView;
}

export interface TronLinkMultisigWatchView {
  action: "watch";
  address: string;
  notifications: number;
}

export type TronLinkMultisigView =
  | TronLinkMultisigListView
  | TronLinkMultisigCreateView
  | TronLinkMultisigSignView
  | TronLinkMultisigWatchView;
