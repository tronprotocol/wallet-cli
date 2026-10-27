import type { TypedDataPayload } from "../typed-data/index.js";

export type Bytes = Uint8Array;
export type KeyPair = { privateKey: Bytes; publicKey: Bytes };

export type UnsignedTx = unknown;
export type SignedTx = unknown;
export type FeeReport = Record<string, unknown>;

// EIP-712/TIP-712 signature, signed digest, and resolved primary type.
export interface TypedDataSignature {
  signature: string;
  digest: string;
  primaryType: string;
}

// Lossless JSON projection of a complete TRON protocol.Transaction.
export interface TronTransactionArtifact {
  visible?: boolean;
  txID: string;
  raw_data: {
    contract: Array<{
      type: string;
      Permission_id?: number;
      parameter?: { value?: Record<string, unknown>; type_url?: string };
      [key: string]: unknown;
    }>;
    expiration?: number;
    timestamp?: number;
    [key: string]: unknown;
  };
  raw_data_hex: string;
  signature?: string[];
  [key: string]: unknown;
}

export interface BroadcastResult {
  txId?: string;
  hash?: string;
  [k: string]: unknown;
}

// submitted means node acceptance; confirmed/failed require an on-chain result.
export type BroadcastStage = "submitted" | "confirmed" | "failed";

export type TxOutcome =
  | { stage: "plan"; tx: UnsignedTx; fee: FeeReport }
  | { stage: "built"; tx: UnsignedTx; hex: string; fee: FeeReport }
  // No fee estimate for caller-supplied transactions.
  | {
      stage: "signed";
      signed: SignedTx;
      hex?: string;
      fee?: FeeReport;
      address?: string;
      txId?: string;
    }
  | ({ stage: BroadcastStage } & BroadcastResult);

// pending means known but unmined; not_found means absent from this node.
export type TxState = "confirmed" | "failed" | "pending" | "not_found";

export interface TxStatusView {
  txid: string;
  state: TxState;
  // state === "confirmed".
  confirmed: boolean;
  // state === "failed".
  failed: boolean;
  blockNumber?: number | string;
  // Head height minus transaction block; omitted if the head read fails.
  confirmations?: number;
}

// Best-effort transfer details decoded from the raw transaction.
export interface TxParties {
  from?: string;
  to?: string;
  amount?: string;
  // Exact base units, before display scaling.
  rawAmount?: string;
  symbol?: string;
  contract?: string;
}

export type TxReceiptKind =
  | "send"
  | "broadcast"
  | "sign"
  | "stake-freeze"
  | "stake-unfreeze"
  | "stake-delegate"
  | "stake-undelegate"
  | "stake-withdraw"
  | "stake-cancel"
  | "contract-send"
  | "contract-deploy"
  | "proposal-create"
  | "proposal-approve"
  | "proposal-delete"
  | "witness-create"
  | "witness-update"
  | "witness-set-brokerage"
  | "contract-clear-abi"
  | "contract-set-origin-energy-limit"
  | "contract-set-user-resource-percent"
  | "vote-cast"
  | "reward-withdraw"
  | "permission-update"
  | "account-activate"
  | "account-set"
  | "asset-issue"
  | "asset-update"
  | "asset-participate"
  | "asset-unfreeze"
  | "exchange-create"
  | "exchange-inject"
  | "exchange-withdraw"
  | "exchange-trade";

export interface TxReceiptView {
  // ERC-8004 write results.
  identity?: {
    agentId?: string;
    operator?: string;
    uri?: string;
    oldURI?: string;
    requestedURI?: string;
    newURI?: string;
    oldOwner?: string;
    requestedOwner?: string;
    newOwner?: string;
  };
  kind: TxReceiptKind;
  mode?: "dry-run" | "build-only" | "sign-only";
  stage?: BroadcastStage;
  txId?: string;
  hash?: string;
  // Signer address for sign-only outcomes.
  address?: string;
  payer?: string;
  field?: "name" | "id";
  value?: string;
  fee?: FeeReport;
  tx?: UnsignedTx;
  signed?: SignedTx;
  hex?: string;
  transaction?: import("./multisig.js").TxApprovalView;
  multiSignFeeSun?: number;
  // Completed or skipped dry-run checks; blockers throw.
  checks?: Array<{ name: string; status: "ok" | "warning" | "skipped"; detail: string }>;
  rawAmount?: string;
  amountSun?: string | number;
  token?: string;
  contract?: string;
  assetId?: string;
  decimals?: number;
  to?: string;
  toContact?: string;
  receiver?: string;
  resource?: string;
  votes?: Array<{ witness: string; count: number }>;
  totalVotes?: number;
  rewardSun?: string | number;
  method?: string;
  contractAddress?: string;
  // Approval spender and token-unit allowance; "unlimited" denotes 2^256-1.
  spender?: string;
  allowance?: string;
  allowanceDecimals?: number;
  // TRC10 quantities use minimal units, scaled by precision for display.
  name?: string;
  abbr?: string;
  issuerAddress?: string;
  participantAddress?: string;
  precision?: number;
  totalSupply?: string;
  price?: string;
  trxNum?: number;
  num?: number;
  startTime?: number;
  endTime?: number;
  url?: string;
  description?: string;
  freeAssetNetLimit?: number;
  publicFreeAssetNetLimit?: number;
  frozenSupply?: Array<{ amount: string; days: number }>;
  paidSun?: string;
  receivedAmount?: string;
  // Bancor quantities use each token's minimal units.
  exchangeId?: number;
  pair?: string;
  creatorAddress?: string;
  traderAddress?: string;
  firstTokenId?: string;
  firstTokenQuant?: string;
  firstTokenLabel?: string;
  firstTokenDecimals?: number;
  secondTokenId?: string;
  secondTokenQuant?: string;
  secondTokenLabel?: string;
  secondTokenDecimals?: number;
  tokenId?: string;
  tokenQuant?: string;
  tokenLabel?: string;
  tokenDecimals?: number;
  otherTokenId?: string;
  otherTokenQuant?: string;
  otherTokenLabel?: string;
  otherTokenDecimals?: number;
  reserveAfter?: string;
  otherReserveAfter?: string;
  soldTokenId?: string;
  soldQuant?: string;
  soldLabel?: string;
  soldDecimals?: number;
  receivedTokenId?: string;
  receivedQuant?: string;
  receivedLabel?: string;
  receivedDecimals?: number;
  estimatedReceivedQuant?: string;
  minReceivedQuant?: string;
  releasedAmount?: string;
  stillFrozenAmount?: string;
  blockNumber?: number;
  energyUsed?: number;
  feeSun?: string | number;
  feeWei?: string;
  // Gas consumed (EVM).
  gasUsed?: string | number;
  // Settled gas price in decimal wei.
  effectiveGasPriceWei?: string;
  // EVM nonce captured before signing, available without a receipt.
  nonce?: number | string;
  withdrawnSun?: string | number;
  result?: string;
  failed?: boolean;
}

// Normalized fields across families, plus raw transaction/receipt data for JSON output.
export interface TxInfoView extends TxParties {
  txid: string;
  // EVM: transfer, contract-call, or contract-creation.
  type?: string;
  nonce?: number;
  // Including block timestamp in Unix seconds.
  blockTime?: number;
  // Settled gas price in decimal wei.
  effectiveGasPriceWei?: string;
  status?: string;
  blockNumber?: number | string;
  // Head height minus transaction block, when available.
  confirmations?: number;
  energyUsed?: number; // tron execution resource
  gasUsed?: string; // evm execution resource
  feeSun?: number; // tron native fee (sun)
  feeWei?: string;
  transaction: unknown;
  info?: unknown; // tron
  receipt?: unknown; // tron
}

export interface SignerSignOpts {
  signal?: AbortSignal;
  // Report a signing-mode fallback before requesting device approval.
  onWarning?: (message: string) => void;
}
export interface Signer {
  kind: "software" | "device";
  address: string;
  precheck?(): Promise<void>;
  sign(tx: UnsignedTx, opts: SignerSignOpts): Promise<SignedTx>;
  signMessage(message: string, opts: SignerSignOpts): Promise<string>;
  // EIP-712/TIP-712; hashing depends on the chain family.
  signTypedData(payload: TypedDataPayload, opts: SignerSignOpts): Promise<TypedDataSignature>;
}

export interface SignStrategy {
  sign(pkHex: string, tx: UnsignedTx): Promise<SignedTx>;
  signMessage(pkHex: string, message: string): Promise<string>;
  signTypedData(pkHex: string, payload: TypedDataPayload): Promise<TypedDataSignature>;
}
