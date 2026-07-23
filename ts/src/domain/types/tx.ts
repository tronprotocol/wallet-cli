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
  | { stage: "signed"; signed: SignedTx; hex?: string; fee?: FeeReport; address?: string; txId?: string }
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
}

/** decoded transfer parties of a tx (best-effort from the raw tx). */
export interface TxParties { from?: string; to?: string; amount?: string; symbol?: string; contract?: string }

/** which action a broadcast receipt describes — drives the summary verb + extra rows.
 *  A typed discriminant replaces matching on the stringly command id. */
export type TxReceiptKind =
  | "send" | "broadcast" | "sign"
  | "stake-freeze" | "stake-unfreeze" | "stake-delegate" | "stake-undelegate" | "stake-withdraw" | "stake-cancel"
  | "contract-send" | "contract-deploy"
  | "vote-cast" | "reward-withdraw" | "permission-update";

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
  fee?: FeeReport;
  tx?: UnsignedTx;
  signed?: SignedTx;
  hex?: string;
  // transfer / stake inputs
  rawAmount?: string;
  amountSun?: string | number;
  token?: string;
  contract?: string;
  assetId?: string;
  decimals?: number;
  to?: string;
  receiver?: string;
  resource?: string;
  votes?: Array<{ witness: string; count: number }>;
  totalVotes?: number;
  rewardSun?: string | number;
  // contract
  method?: string;
  contractAddress?: string;
  // confirmed / failed on-chain numbers
  blockNumber?: number;
  energyUsed?: number;
  feeSun?: string | number;
  withdrawnSun?: string | number;
  result?: string;
  failed?: boolean;
}

/** `tx info` output: flat normalized display fields (superset across families) + the raw
 *  tx/receipt blobs (kept for JSON detail). Each family populates only its own subset. */
export interface TxInfoView extends TxParties {
  txid: string;
  status?: string;
  blockNumber?: number | string;
  energyUsed?: number; // tron execution resource
  feeSun?: number; // tron native fee (sun)
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
