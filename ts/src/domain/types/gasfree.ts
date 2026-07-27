export type GasFreeState = "WAITING" | "INPROGRESS" | "CONFIRMING" | "SUCCEED" | "FAILED";

export interface GasFreeTokenConfig {
  tokenAddress: string;
  activateFee: string;
  transferFee: string;
  symbol?: string;
  decimals?: number;
}

export interface GasFreeProviderConfig {
  address: string;
  defaultDeadlineDuration: string;
  isDefault?: boolean;
}

export interface GasFreeAssetConfig {
  tokenAddress: string;
  activateFee: string;
  transferFee: string;
}

export interface GasFreeAddressInfo {
  ownerAddress: string;
  gasFreeAddress: string;
  active: boolean;
  nonce: string;
  allowSubmit?: boolean;
  assets: GasFreeAssetConfig[];
}

/** Exact immutable TIP-712 PermitTransfer fields. uint256 values remain decimal strings. */
export interface GasFreeAuthorization {
  token: string;
  serviceProvider: string;
  user: string;
  receiver: string;
  value: string;
  maxFee: string;
  deadline: string;
  version: string;
  nonce: string;
}

export interface SignedGasFreeAuthorization extends GasFreeAuthorization {
  /** Java-compatible lowercase r || s || v hex without a 0x prefix. */
  sig: string;
}

/** Untrusted provider receipt, normalized losslessly before application-layer validation. */
export interface GasFreeTransferRecord {
  id: string;
  state: GasFreeState;
  tokenAddress: string;
  providerAddress: string;
  accountAddress: string;
  gasFreeAddress: string;
  targetAddress: string;
  amount: string;
  maxFee?: string;
  nonce: string;
  /** GasFree returns this timestamp in milliseconds, while the signed deadline is in seconds. */
  expiredAt?: string;
  estimatedTransferFee?: string;
  estimatedActivateFee?: string;
  estimatedTotalFee?: string;
  estimatedTotalCost?: string;
  txnHash?: string;
  txnState?: string;
  txnAmount?: string;
  txnTransferFee?: string;
  txnActivateFee?: string;
  txnTotalFee?: string;
  txnTotalCost?: string;
  txnBlockNum?: string;
  txnBlockTimestamp?: string;
  failureReason?: string;
}

export interface GasFreeInfoView {
  ownerAddress: string;
  gasFreeAddress: string;
  active: boolean;
  nonce: string;
  tokens: Array<{
    symbol: string;
    address: string;
    decimals: number;
    activateFee: string;
    transferFee: string;
    balance: string;
  }>;
}

export interface GasFreeTransferView {
  kind: "gasfree-transfer";
  stage: "dry-run" | "submitted" | "confirmed" | "failed";
  traceId?: string;
  state?: GasFreeState;
  txId?: string;
  token: string;
  tokenAddress: string;
  decimals: number;
  amount: string;
  serviceFee: string;
  activateFee: string;
  authorizedMaxFee: string;
  totalDeducted: string;
  owner: string;
  from: string;
  to: string;
  toContact?: string;
  serviceProvider: string;
  nonce: string;
  deadline: string;
  failureReason?: string;
}

export interface GasFreeTraceView {
  traceId: string;
  state: GasFreeState;
  txId?: string;
  token: string;
  tokenAddress: string;
  decimals: number;
  amount: string;
  serviceFee: string;
  activateFee: string;
  totalDeducted: string;
  from: string;
  owner: string;
  to: string;
  nonce: string;
  failureReason?: string;
}
