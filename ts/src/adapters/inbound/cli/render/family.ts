import type { TxInfoView } from "../../../../domain/types/index.js"
import type { TextRenderContext } from "../contracts/index.js"
import { ChainFamily } from "../../../../domain/family/index.js"
import { formatScalar, formatInt, formatSun } from "./scalars.js"
import { type Pair } from "./layout.js"

/**
 * Per-family render hooks — the one table that folds the scattered `r.family === tron ? … : …`
 * branches. Adding a chain = one entry here (alongside its FAMILIES + FamilyDef entries).
 */
interface FamilyRenderHooks {
  /** the full TxInfo detail rows (family-shaped: Energy/TRX vs Gas/wei). Reads the flat
   *  TxInfoView and picks its own family's fields — no narrowing cast (no closed union). */
  txInfoRows(r: TxInfoView): Pair[]
  /** native smallest-unit amount → display string (sun→TRX / wei). */
  nativeAmount(raw: string): string
  /** fee fallback when no structured fee object is present. */
  feeFallback(fee: unknown): string
  /** address-type label for the per-family address rows. */
  addressLabel: string
}

const txInfoAmount = (v: string | undefined, suffix: string): string => (v === undefined || v === "" ? "" : `${formatScalar(v)}${suffix}`)

export const FAMILY_RENDER: Record<ChainFamily, FamilyRenderHooks> = {
  tron: {
    nativeAmount: (raw) => `${formatSun(raw)} TRX`,
    feeFallback: (fee) => `${formatSun(fee)} TRX`,
    addressLabel: "TRON address",
    txInfoRows: (r) => [
      ["TxID", r.txid],
      ["From", r.from ?? ""],
      ["To", r.to ?? ""],
      ["Amount", txInfoAmount(r.amount, r.symbol ? ` ${r.symbol}` : "")],
      ["Status", r.status ?? "unknown"],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
      ["Energy", r.energyUsed === undefined ? "" : formatInt(r.energyUsed)],
      ["Fee", r.feeSun === undefined ? "" : `${formatSun(r.feeSun)} TRX`],
    ],
  },
}

export function familyAddressLabel(family: string): string {
  return FAMILY_RENDER[family as ChainFamily]?.addressLabel ?? `${family} address`
}

/** the active chain family for a chain-command renderer. Chain commands always resolve a network
 *  before running, so `ctx.net` is present; the tron fallback only guards a shape that can't occur. */
export function renderFamily(ctx?: TextRenderContext): ChainFamily {
  return ctx?.net?.family ?? "tron"
}
