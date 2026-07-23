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

export interface TxSignView {
  kind: "tx-sign";
  signer: string;
  signerWeight: number;
  hex: string;
  out?: string;
  transaction: TxApprovalView;
}
