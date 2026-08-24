import type { TxInfoView } from "../../../../domain/types/index.js";
import { RESOURCES, resourceOfRpcCode, type Resource } from "../../../../domain/resources/index.js";
import type { TextRenderContext } from "../contracts/index.js";
import { ChainFamily } from "../../../../domain/family/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";
import { formatScalar, formatInt, formatGwei, formatSun, formatWei } from "./scalars.js";
import { asObj, type Obj, type Pair } from "./layout.js";

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
  /** `account info` rows below the Label. TRON reports the node's account object — permissions,
   *  resources, stakes; EVM has no such RPC and reports a flat balance/nonce/code triple. The
   *  field SETS differ, not just their values, so neither family can read the other's payload. */
  accountInfoRows(d: Obj, symbol: string): Pair[];
  /** `chain prices` rows. TRON prices energy and bandwidth in SUN; EVM prices gas per the fee
   *  model the chain reports. Same reason as accountInfoRows: disjoint field sets. */
  chainPricesRows(d: Obj, symbol: string): Pair[];
}

const txInfoAmount = (v: string | undefined, suffix: string): string =>
  v === undefined || v === "" ? "" : `${formatScalar(v)}${suffix}`;

export const FAMILY_RENDER: Record<ChainFamily, FamilyRenderHooks> = {
  tron: {
    nativeAmount: (raw, symbol) => `${formatSun(raw)} ${symbol}`,
    feeFallback: (fee, symbol) => `${formatSun(fee)} ${symbol}`,
    addressLabel: "TRON address",
    accountInfoRows: (d, symbol) => {
      const account = asObj(d.account);
      const owner = asObj(account.owner_permission);
      const active = Array.isArray(account.active_permission) ? account.active_permission.length : 0;
      const created = account.create_time
        ? new Date(Number(account.create_time)).toISOString().slice(0, 10)
        : "";
      const ownerKeys = Array.isArray(owner.keys) ? owner.keys.length : "?";
      const resources = asObj(d.resources);
      const bandwidth = asObj(resources.bandwidth);
      const energy = asObj(resources.energy);
      const rows: Pair[] = [["Address", String(d.address ?? "")]];
      rows.push(["Balance", `${formatSun(account.balance)} ${symbol}`]);
      const staked = stakedSummary(account, symbol);
      if (staked) rows.push(["Staked", staked]);
      if (resources.energy)
        rows.push(["Energy", `used ${formatInt(energy.used)} / ${formatInt(energy.limit)}`]);
      if (resources.bandwidth)
        rows.push(["Bandwidth", `used ${formatInt(bandwidth.used)} / ${formatInt(bandwidth.limit)}`]);
      rows.push(["Created", created]);
      rows.push([
        "Permissions",
        `owner ${String(owner.threshold ?? "?")}-of-${ownerKeys}, ${active} active group${active === 1 ? "" : "s"}`,
      ]);
      return rows;
    },
    chainPricesRows: (d, symbol) => {
      const energy = asObj(d.energy);
      const bandwidth = asObj(d.bandwidth);
      return [
        ["Energy price", `${formatInt(energy.currentSunPerUnit)} SUN / unit    (current)`],
        ["Bandwidth price", `${formatInt(bandwidth.currentSunPerUnit)} SUN / unit  (current)`],
        ["Memo fee", `${formatSun(d.memoFeeSun)} ${symbol}`],
      ];
    },
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
    accountInfoRows: (d, symbol) => [
      ["Address", String(d.address ?? "")],
      ["Balance", `${formatWei(d.balance)} ${symbol}`],
      ["Nonce", formatInt(d.nonce)],
      // The distinction a reader needs before sending: an address with code may reject a plain
      // transfer, and "isContract: false" is not a phrase to put in front of a person.
      ["Type", d.isContract ? "contract" : "externally owned"],
    ],
    // Priced in gwei, the unit --max-fee and --priority-fee accept: showing wei here and taking
    // gwei there would make the reader do the nine-zero conversion themselves. JSON keeps wei.
    chainPricesRows: (d) => {
      const rows: Pair[] = [["Fee model", String(d.feeModel ?? "")]];
      if (d.baseFeeWei !== undefined) rows.push(["Base fee", `${formatGwei(d.baseFeeWei)} gwei`]);
      if (d.priorityFeeWei !== undefined)
        rows.push(["Priority fee", `${formatGwei(d.priorityFeeWei)} gwei`]);
      if (d.gasPriceWei !== undefined) rows.push(["Gas price", `${formatGwei(d.gasPriceWei)} gwei`]);
      return rows;
    },
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

/** Sum FreezeBalanceV2 stakes into a "<total> TRX (energy <e> + bandwidth <b>)" summary. */
function stakedSummary(account: Obj, symbol: string): string {
  const frozen = Array.isArray(account.frozenV2) ? account.frozenV2.map(asObj) : [];
  // frozenV2's bandwidth entries carry no `type`, so an unrecognized code folds into bandwidth.
  const sums = new Map<Resource, bigint>(RESOURCES.map((r) => [r, 0n]));
  for (const f of frozen) {
    const r = resourceOfRpcCode(String(f.type ?? "")) ?? "bandwidth";
    const amount = safeUnsignedBigInt(f.amount ?? 0);
    // An unsafe JS number has already lost precision. Omit the summary instead of presenting a
    // plausible but incorrect total; the raw account payload remains available in JSON mode.
    if (amount === null) return "";
    sums.set(r, (sums.get(r) ?? 0n) + amount);
  }
  const total = RESOURCES.reduce((t, r) => t + (sums.get(r) ?? 0n), 0n);
  if (total === 0n) return "";
  const parts = RESOURCES.map((r) => `${r} ${formatSun(sums.get(r) ?? 0n)}`).join(" + ");
  return `${formatSun(total)} ${symbol} (${parts})`;
}

function safeUnsignedBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}
