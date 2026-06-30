/**
 * SharedTypes — crypto / signing / tx / rpc (implementations live in upper layers)
 * plus the per-command typed text outputs the text formatter narrows on.
 */
import type { ChainFamily } from "../family/index.js";

export type Bytes = Uint8Array;
export type KeyPair = { privateKey: Bytes; publicKey: Bytes };

export type UnsignedTx = unknown;
export type SignedTx = unknown;
export type FeeReport = Record<string, unknown>;

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
  | { stage: "signed"; signed: SignedTx; fee: FeeReport }
  | ({ stage: BroadcastStage } & BroadcastResult);

// ════════════════════ per-command typed text outputs ══════════════════════
// Flat, family-agnostic shapes: shared transaction contracts do not enumerate chains.
// `tx status` carries a `failed` the command computes (tron: receipt result ≠ SUCCESS), so the
// renderer needs no per-family branch. `tx info` is a superset of on-chain fields — each family
// populates its own subset and the per-family render table (FAMILY_RENDER) shapes them into rows.
export interface TxStatusView {
  family: ChainFamily;
  txid: string;
  confirmed: boolean;
  failed: boolean;
  blockNumber?: number | string;
}

/** decoded transfer parties of a tx (best-effort from the raw tx). */
export interface TxParties { from?: string; to?: string; amount?: string; symbol?: string; contract?: string }

/** which action a broadcast receipt describes — drives the summary verb + extra rows.
 *  A typed discriminant replaces matching on the stringly command id. */
export type TxReceiptKind =
  | "send" | "broadcast"
  | "stake-freeze" | "stake-unfreeze" | "stake-delegate" | "stake-undelegate" | "stake-withdraw" | "stake-cancel"
  | "contract-send" | "contract-deploy";

/**
 * Canonical tx receipt the signing commands return (dry-run / sign-only / broadcast stages).
 * Flat (JSON stays additive); the text formatter narrows on `kind`/`family` and reads fixed keys
 * instead of probing aliases. Commands populate the subset relevant to their action.
 */
export interface TxReceiptView {
  kind: TxReceiptKind;
  family: ChainFamily;
  mode?: "dry-run" | "sign-only";
  stage?: BroadcastStage;
  txId?: string;
  hash?: string;
  // plan / sign-only
  fee?: FeeReport;
  tx?: UnsignedTx;
  signed?: SignedTx;
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
  family: ChainFamily;
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
}

/** per-family signing behaviour; SoftwareSigner delegates to this (no `if family`).
 * A port whose concrete adapter is supplied by application wiring. */
export interface SignStrategy {
  sign(pkHex: string, tx: UnsignedTx): Promise<SignedTx>;
  signMessage(pkHex: string, message: string): Promise<string>;
}
