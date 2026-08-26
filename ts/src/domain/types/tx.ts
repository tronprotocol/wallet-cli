/**
 * SharedTypes — crypto / signing / tx / rpc (implementations live in upper layers)
 * plus the per-command typed text outputs the text formatter narrows on.
 */
import type { TypedDataPayload } from "../typed-data/index.js";

export type Bytes = Uint8Array;
export type KeyPair = { privateKey: Bytes; publicKey: Bytes };

export type UnsignedTx = unknown;
export type SignedTx = unknown;
export type FeeReport = Record<string, unknown>;

/** result of signing structured data (EIP-712 / TIP-712). `digest` is the hash that was signed;
 *  `primaryType` is echoed back (inferred when the caller omitted it) so a caller can assert what
 *  was signed without re-deriving it. */
export interface TypedDataSignature {
  signature: string;
  digest: string;
  primaryType: string;
}

/** Lossless JSON projection of one complete TRON protocol.Transaction artifact. */
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

/** broadcast stages: `submitted` (node accepted, not yet mined — the default, non-blocking),
 *  or `confirmed`/`failed` after `--wait` polls the tx on-chain. */
export type BroadcastStage = "submitted" | "confirmed" | "failed";

export type TxOutcome =
  | { stage: "plan"; tx: UnsignedTx; fee: FeeReport }
  | { stage: "built"; tx: UnsignedTx; hex: string; fee: FeeReport }
  // `fee` is absent when the caller supplied the transaction (tx sign): nothing was estimated.
  | {
      stage: "signed";
      signed: SignedTx;
      hex?: string;
      fee?: FeeReport;
      address?: string;
      txId?: string;
    }
  | ({ stage: BroadcastStage } & BroadcastResult);

// ════════════════════ per-command typed text outputs ══════════════════════
// Flat, family-agnostic shapes: shared transaction contracts carry no `family` — the active
// chain is already known from the request (the renderer reads `ctx.net.family`), so duplicating
// it in the payload is redundant. `tx status` carries a `failed` the command computes (tron:
// receipt result ≠ SUCCESS). `tx info` is a superset of on-chain fields — each family populates
// its own subset and the per-family render table (FAMILY_RENDER[ctx.net.family]) shapes the rows.
/** four-state confirmation status.
 *  - `confirmed`/`failed`: has a block + receipt (result = SUCCESS ⇒ confirmed, else failed)
 *  - `pending`: the node knows the tx (getTransactionById) but it is not yet in a block
 *  - `not_found`: the node has no record of the tx (never broadcast, dropped, or not yet propagated) */
export type TxState = "confirmed" | "failed" | "pending" | "not_found";

export interface TxStatusView {
  txid: string;
  state: TxState;
  /** kept for back-compat: `state === "confirmed"`. */
  confirmed: boolean;
  /** kept for back-compat: `state === "failed"`. */
  failed: boolean;
  blockNumber?: number | string;
  /**
   * Head height minus the transaction's block — how much chain has been built on top of it.
   *
   * Present only once there IS a block, and best-effort: the head read is a second call, and a
   * failed one costs this field rather than the answer the command was asked for. `--wait` stops
   * at the receipt, so this is the number a caller reads to decide whether that is enough.
   */
  confirmations?: number;
}

/** decoded transfer parties of a tx (best-effort from the raw tx). */
export interface TxParties {
  from?: string;
  to?: string;
  amount?: string;
  /** the same amount in base units — the exact integer, beside the scaled display value. */
  rawAmount?: string;
  symbol?: string;
  contract?: string;
}

/** which action a broadcast receipt describes — drives the summary verb + extra rows.
 *  A typed discriminant replaces matching on the stringly command id. */
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

/**
 * Canonical tx receipt the signing commands return (dry-run / sign-only / broadcast stages).
 * Flat (JSON stays additive); the text formatter narrows on `kind` (+ `ctx.net.family` for the
 * per-family fee/amount hooks) and reads fixed keys instead of probing aliases. Commands populate
 * the subset relevant to their action.
 */
export interface TxReceiptView {
  kind: TxReceiptKind;
  mode?: "dry-run" | "build-only" | "sign-only";
  stage?: BroadcastStage;
  txId?: string;
  hash?: string;
  // plan / sign-only
  /** address that produced the signature (sign-only outcomes). */
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
  /** pre-broadcast checks a dry run ran; a blocker throws, so these are what held or was skipped. */
  checks?: Array<{ name: string; status: "ok" | "warning" | "skipped"; detail: string }>;
  // transfer / stake inputs
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
  // contract
  method?: string;
  contractAddress?: string;
  /** approve(address,uint256) only: who was approved, and for how much in token units
   *  ("unlimited" for 2^256-1). The command line carries a scaled uint256 nobody can read. */
  spender?: string;
  allowance?: string;
  allowanceDecimals?: number;
  // TRC10 assets — quantities in the asset's minimal units, rendered with `precision`
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
  // Bancor exchange — quantities in each token's minimal units, rendered with its own decimals
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
  // confirmed / failed on-chain numbers
  blockNumber?: number;
  energyUsed?: number;
  feeSun?: string | number;
  feeWei?: string;
  /** gas actually burnt (EVM); pairs with effectiveGasPriceWei to explain feeWei. */
  gasUsed?: string | number;
  /** the per-gas price the chain settled at (EVM), decimal wei. */
  effectiveGasPriceWei?: string;
  /**
   * The transaction's own nonce (EVM).
   *
   * Captured while building rather than read back from a receipt: it is decided before the
   * transaction is signed, and §4.3 names it the entry point for diagnosing a stuck transaction —
   * which is exactly the case where no receipt will ever arrive.
   */
  nonce?: number | string;
  withdrawnSun?: string | number;
  result?: string;
  failed?: boolean;
}

/** `tx info` output: flat normalized display fields (superset across families) + the raw
 *  tx/receipt blobs (kept for JSON detail). Each family populates only its own subset. */
export interface TxInfoView extends TxParties {
  txid: string;
  /** coarse kind: transfer / contract-call / contract-creation (EVM). */
  type?: string;
  /** the transaction's own nonce (EVM). */
  nonce?: number;
  /** the including block's timestamp, Unix SECONDS — the same unit `chain node` reports. */
  blockTime?: number;
  /** the per-gas price the chain settled at (EVM), decimal wei. */
  effectiveGasPriceWei?: string;
  status?: string;
  blockNumber?: number | string;
  /** head height minus this transaction's block; best-effort, see TxStatusView.confirmations. */
  confirmations?: number;
  energyUsed?: number; // tron execution resource
  gasUsed?: number | string; // evm execution resource
  feeSun?: number; // tron native fee (sun)
  // EVM native fee. A separate field rather than a shared `fee`: the UNIT is in the name, so a
  // reader can never mistake one family's magnitude for the other's (18 decimals vs 6).
  feeWei?: string;
  transaction: unknown;
  info?: unknown; // tron
  receipt?: unknown; // tron
}

// ════════════════════════════ signing ports ═══════════════════════════════
export interface SignerSignOpts {
  signal?: AbortSignal;
}
export interface Signer {
  kind: "software" | "device";
  address: string;
  precheck?(): Promise<void>;
  sign(tx: UnsignedTx, opts: SignerSignOpts): Promise<SignedTx>;
  /** raw message signing (not via TxPipeline). */
  signMessage(message: string, opts: SignerSignOpts): Promise<string>;
  /** structured-data signing (EIP-712 / TIP-712); hashing is family-specific and lives behind the
   *  strategy (software) or the device port (Ledger). */
  signTypedData(payload: TypedDataPayload, opts: SignerSignOpts): Promise<TypedDataSignature>;
}

/** per-family signing behaviour; SoftwareSigner delegates to this (no `if family`).
 * A port whose concrete adapter is supplied by application wiring. */
export interface SignStrategy {
  sign(pkHex: string, tx: UnsignedTx): Promise<SignedTx>;
  signMessage(pkHex: string, message: string): Promise<string>;
  signTypedData(pkHex: string, payload: TypedDataPayload): Promise<TypedDataSignature>;
}
