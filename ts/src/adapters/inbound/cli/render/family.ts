import type { TxInfoView } from "../../../../domain/types/index.js";
import type { TextRenderContext } from "../contracts/index.js";
import { ChainFamily } from "../../../../domain/family/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";
import { formatScalar, formatInt, formatSun, formatWei } from "./scalars.js";
import { type Pair } from "./layout.js";

/**
 * Per-family render hooks — the one table that folds the scattered `r.family === tron ? … : …`
 * branches. Adding a chain = one entry here (alongside its FAMILIES + FamilyDef entries).
 */
/**
 * Every hook takes the native coin's `symbol` rather than baking one in. This table is keyed by
 * FAMILY, so `evm:1` and `evm:56` share one entry — and their coins are ETH and BNB. A hook that
 * hardcoded the symbol rendered a BNB balance as "ETH".
 */
interface FamilyRenderHooks {
  /** the full TxInfo detail rows (family-shaped: Energy/TRX vs Gas/wei). Reads the flat
   *  TxInfoView and picks its own family's fields — no narrowing cast (no closed union). */
  txInfoRows(r: TxInfoView, symbol: string): Pair[];
  /** native smallest-unit amount → display string (sun→TRX / wei→ETH or BNB). */
  nativeAmount(raw: string, symbol: string): string;
  /** fee fallback when no structured fee object is present. */
  feeFallback(fee: unknown, symbol: string): string;
  /** address-type label for the per-family address rows. */
  addressLabel: string;
}

const txInfoAmount = (v: string | undefined, suffix: string): string =>
  v === undefined || v === "" ? "" : `${formatScalar(v)}${suffix}`;

export const FAMILY_RENDER: Record<ChainFamily, FamilyRenderHooks> = {
  tron: {
    nativeAmount: (raw, symbol) => `${formatSun(raw)} ${symbol}`,
    feeFallback: (fee, symbol) => `${formatSun(fee)} ${symbol}`,
    addressLabel: "TRON address",
    txInfoRows: (r, symbol) => [
      ["TxID", r.txid],
      ["From", r.from ?? ""],
      ["To", r.to ?? ""],
      ["Amount", txInfoAmount(r.amount, r.symbol ? ` ${r.symbol}` : "")],
      ["Status", r.status ?? "unknown"],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
      ["Energy", r.energyUsed === undefined ? "" : formatInt(r.energyUsed)],
      ["Fee", r.feeSun === undefined ? "" : `${formatSun(r.feeSun)} ${symbol}`],
    ],
  },
  evm: {
    nativeAmount: (raw, symbol) => `${formatWei(raw)} ${symbol}`,
    feeFallback: (fee, symbol) => `${formatWei(fee)} ${symbol}`,
    addressLabel: "EVM address",
    txInfoRows: (r, symbol) => [
      ["TxID", r.txid],
      ["From", r.from ?? ""],
      ["To", r.to ?? ""],
      ["Amount", txInfoAmount(r.amount, r.symbol ? ` ${r.symbol}` : "")],
      ["Status", r.status ?? "unknown"],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
      ["Gas", r.gasUsed === undefined ? "" : formatInt(r.gasUsed)],
      ["Fee", r.feeWei === undefined ? "" : `${formatWei(r.feeWei)} ${symbol}`],
    ],
  },
};

export function familyAddressLabel(family: string): string {
  return FAMILY_RENDER[family as ChainFamily]?.addressLabel ?? `${family} address`;
}

/**
 * The active chain family for a chain-command renderer. Chain commands always resolve a network
 * before running, so `ctx.net` is present and this cannot legitimately fail.
 *
 * It throws rather than defaulting: the previous default was "tron", which was harmless while
 * that was the only family and renders wei amounts as TRX now that it is not. A receipt naming
 * the wrong currency is worse than no receipt.
 */
/** the selected network's native coin symbol — the one the render hooks label amounts with. */
export function renderSymbol(ctx?: TextRenderContext): string {
  const symbol = ctx?.net?.nativeSymbol;
  if (!symbol) {
    throw new ExecutionError(
      "internal_error",
      "cannot render a native amount without a resolved network",
    );
  }
  return symbol;
}

export function renderFamily(ctx?: TextRenderContext): ChainFamily {
  const family = ctx?.net?.family;
  if (!family) {
    throw new ExecutionError(
      "internal_error",
      "cannot render a chain result without a resolved network",
    );
  }
  return family;
}
