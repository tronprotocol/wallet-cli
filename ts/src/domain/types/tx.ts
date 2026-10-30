import type { Sun } from "../amounts/index.js";
import type { TypedDataPayload } from "../typed-data/index.js";

export type Bytes = Uint8Array;
export type KeyPair = { privateKey: Bytes; publicKey: Bytes };

export type UnsignedTx = TronTransactionArtifact | EvmUnsignedTx;
export type SignedTx = TronTransactionArtifact | EvmSignedTx;
// The signed form of an unsigned transaction of the same family.
export type SignedTxOf<T extends UnsignedTx> = T extends TronTransactionArtifact
  ? TronTransactionArtifact
  : EvmSignedTx;

// SUN amounts are decimal strings; energy is in resource units.
export interface TronFeeReport {
  feeModel: "tron-resource";
  energy?: number;
  energyPriceSun?: string;
  availableEnergy?: number;
  feeSun?: Sun;
  balanceSun?: string;
  bandwidthBurnSunIfNoFreeze?: number;
  createAccountFeeSun?: string;
  systemContractFeeSun?: string;
  minimumFeeSun?: string;
  note?: string;
}

// Wei amounts are decimal strings; gasLimit is in gas units.
export interface EvmFeeReport {
  feeModel: "eip1559" | "legacy";
  maxCostWei: string;
  gasLimit: string;
  maxPerGasWei?: string;
}

export type FeeReport = TronFeeReport | EvmFeeReport;

// EIP-712/TIP-712 signature, signed digest, and resolved primary type.
export interface TypedDataSignature {
  signature: string;
  digest: string;
  primaryType: string;
}

// TRON protocol JSON as TronWeb and the node produce it.
export type TronProtocolValue =
  string | number | boolean | null | TronProtocolValue[] | TronProtocolObject;

export interface TronProtocolObject {
  [field: string]: TronProtocolValue;
}

export interface TronTransactionContract {
  type: string;
  Permission_id?: number;
  parameter?: { value?: TronProtocolObject; type_url?: string };
}

// Lossless JSON projection of a complete TRON protocol.Transaction; signature holds prior approvals.
export interface TronTransactionArtifact {
  visible?: boolean;
  txID: string;
  raw_data: {
    contract: TronTransactionContract[];
    ref_block_bytes?: string;
    ref_block_hash?: string;
    expiration?: number;
    timestamp?: number;
    fee_limit?: number;
    data?: string;
  };
  raw_data_hex: string;
  signature?: string[];
  // 41-prefixed hex address a deployment creates; present only on CreateSmartContract transactions.
  contract_address?: string;
}

// ethers TransactionLike. Built transactions carry chainId and nonce as safe integers and quantities as
// decimal strings; decoded ones carry chainId as a decimal string and null for absent fields. A payment SDK
// may pass bigint or 0x hex quantities.
export interface EvmUnsignedTx {
  type?: number | null;
  to?: string | null;
  data?: string;
  value?: string | bigint | null;
  nonce?: number;
  gasLimit?: string | bigint | null;
  gasPrice?: string | bigint | null;
  maxPriorityFeePerGas?: string | bigint | null;
  maxFeePerGas?: string | bigint | null;
  chainId?: number | string | bigint | null;
  accessList?: Array<{ address: string; storageKeys: string[] }> | null;
  sig?: { r: string; s: string; v: number; networkV: string | null } | null;
}

// 0x hex of the signed serialization and its hash.
export interface EvmSignedTx {
  raw: string;
  hash: string;
}

// alreadyKnown means the node already holds the transaction.
export interface BroadcastResult {
  txId?: string;
  hash?: string;
  alreadyKnown?: boolean;
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
  | ({ stage: BroadcastStage } & BroadcastResult & Partial<TxConfirmation>);

// A mined transaction's receipt. TRON fees are SUN and resources are units; EVM quantities are decimal strings.
export interface TxConfirmation {
  confirmed: true;
  failed: boolean;
  blockNumber?: number;
  feeSun?: number;
  energyUsed?: number;
  netUsed?: number;
  energyFeeSun?: number;
  netFeeSun?: number;
  withdrawnSun?: Sun;
  assetIssueID?: string;
  unfreezeAmount?: Sun;
  exchangeId?: number;
  exchangeReceived?: string;
  exchangeInjectedOther?: string;
  exchangeWithdrawnOther?: string;
  // TRON receipt.result as the node reported it.
  result?: string;
  gasUsed?: string;
  feeWei?: string;
  effectiveGasPriceWei?: string;
  contractAddress?: string;
}

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
  amountSun?: Sun;
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
  // Time until cast votes are tallied.
  maintenanceIntervalMs?: number;
  rewardSun?: Sun;
  // Minimum time between reward withdrawals.
  withdrawIntervalMs?: number;
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
  feeSun?: number;
  feeWei?: string;
  // Gas consumed (EVM), decimal gas units.
  gasUsed?: string;
  // Settled gas price in decimal wei.
  effectiveGasPriceWei?: string;
  // EVM nonce captured before signing, available without a receipt.
  nonce?: number | string;
  withdrawnSun?: Sun;
  result?: string;
  failed?: boolean;
}

declare const rawNodePayload: unique symbol;

// Node JSON passed through verbatim for output; opaque so inner layers cannot read it.
export interface RawNodePayload {
  readonly [rawNodePayload]: true;
}

// JSON as a node returned it, passed through for output; inner layers do not branch on it.
export type NodeJson =
  string | number | boolean | null | NodeJson[] | { readonly [field: string]: NodeJson };

// A mined EVM receipt; quantities are decimal strings.
export interface EvmReceipt {
  readonly success: boolean;
  readonly gasUsed?: string;
  readonly feeWei?: string;
  readonly effectiveGasPriceWei?: string;
  readonly blockNumber?: number;
  readonly contractAddress?: string;
  readonly raw: NodeJson;
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
  transaction: RawNodePayload | NodeJson;
  info?: RawNodePayload | NodeJson; // tron
  // EVM; null while pending.
  receipt?: EvmReceipt | null;
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
