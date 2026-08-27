import type { TxInfoView, TxReceiptView } from "../../../../domain/types/index.js";
import { RESOURCES, resourceOfRpcCode, type Resource } from "../../../../domain/resources/index.js";
import type { TextRenderContext } from "../contracts/index.js";
import { ChainFamily } from "../../../../domain/family/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";
import { formatScalar, formatInt, formatGwei, formatSun, formatUtc, formatWei } from "./scalars.js";
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
  /** `chain node` rows. TRON has a p2p network to report on, EVM has a chain id to check the
   *  endpoint against — neither field exists on the other side. */
  chainNodeRows(d: Obj): Pair[];
  /** `block` rows. The payload is the node's own object (§9.1), so the two families arrive in
   *  different shapes and each picks its own fields out. */
  blockRows(block: Obj, timestampMs: number | undefined): Pair[];
  /** rows a broadcast receipt shows BEFORE the TxID — the transaction's own identifiers.
   *  EVM has a nonce; TRON's transactions are identified only by their hash. */
  receiptIdentityRows(r: TxReceiptView): Pair[];
  /** rows a CONFIRMED receipt shows after the block: what the transaction actually consumed.
   *  TRON bills energy and a SUN fee; EVM bills gas at a settled per-gas price. */
  receiptSettlementRows(r: TxReceiptView, symbol: string): Pair[];
}

const txInfoAmount = (v: string | undefined, suffix: string): string =>
  v === undefined || v === "" ? "" : `${formatScalar(v)}${suffix}`;

/** "#84,120,345  2026-08-24 12:31:12 (~2s ago — in sync)" — shared by both families' node views. */
function headBlockRow(d: Obj): Pair {
  const head = asObj(d.headBlock);
  const headTimestamp = Number(head.timestamp ?? 0);
  const ageSeconds =
    headTimestamp > 0 ? Math.max(0, Math.round((Date.now() - headTimestamp) / 1000)) : null;
  const sync = d.inSync ? "in sync" : "lagging";
  const age = ageSeconds === null ? "—" : `~${ageSeconds}s ago — ${sync}`;
  return ["Head block", `#${formatInt(head.number)}  ${nodeTime(head.timestamp)} (${age})`];
}

/** epoch-ms → "YYYY-MM-DD HH:MM:SS", or "—" for a missing/zero stamp (the node view's convention
 *  for a field an endpoint did not expose). */
function nodeTime(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n).toISOString().replace("T", " ").slice(0, 19);
}

/** a best-effort field the endpoint may not serve: null renders as the dash, per `chain node`. */
function orDash(v: unknown): string {
  return v === null || v === undefined ? "—" : String(v);
}

/** `Fee <amount> <symbol>  (<gas> gas × <price> gwei)` — the total plus what it is the product of.
 *  Falls back to the bare total when the receipt did not carry the two components. */
function evmFeeRow(fee: unknown, gasUsed: unknown, priceWei: unknown, symbol: string): string {
  const total = `${formatWei(fee)} ${symbol}`;
  if (gasUsed === undefined || priceWei === undefined) return total;
  return `${total}  (${formatInt(gasUsed)} gas × ${formatGwei(priceWei)} gwei)`;
}

export const FAMILY_RENDER: Record<ChainFamily, FamilyRenderHooks> = {
  tron: {
    nativeAmount: (raw, symbol) => `${formatSun(raw)} ${symbol}`,
    feeFallback: (fee, symbol) => `${formatSun(fee)} ${symbol}`,
    addressLabel: "TRON address",
    accountInfoRows: (d, symbol) => {
      const account = asObj(d.account);
      const owner = asObj(account.owner_permission);
      const active = Array.isArray(account.active_permission)
        ? account.active_permission.length
        : 0;
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
        rows.push([
          "Bandwidth",
          `used ${formatInt(bandwidth.used)} / ${formatInt(bandwidth.limit)}`,
        ]);
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
    chainNodeRows: (d) => {
      const solid = asObj(d.solidBlock);
      const peers = asObj(d.peers);
      return [
        ["Endpoint", orDash(d.endpoint)],
        ["Version", orDash(d.version)],
        headBlockRow(d),
        [
          "Solid block",
          d.solidBlock === null
            ? "—"
            : `#${formatInt(solid.number)}  (${formatInt(d.lagBlocks)} blocks behind head)`,
        ],
        [
          "Peers",
          d.peers === null
            ? "—"
            : `${formatInt(peers.connected)} connected / ${formatInt(peers.active)} active`,
        ],
      ];
    },
    // The node's protobuf block: header fields live under block_header.raw_data, and the hash is
    // the block's own `blockID`. Unchanged from what this command has always printed.
    blockRows: (block, timestampMs) => {
      const header = asObj(asObj(block.block_header).raw_data);
      const number = block.number ?? header.number;
      const txs = Array.isArray(block.transactions) ? block.transactions.length : 0;
      return [
        ["Number", number === undefined ? "" : `#${formatInt(number)}`],
        ["Time", timestampMs ? formatUtc(timestampMs) : "unknown"],
        ["Transactions", String(txs)],
      ];
    },
    // A TRON transaction is identified by its hash alone — there is no per-account sequence.
    receiptIdentityRows: () => [],
    receiptSettlementRows: (r, symbol) => {
      const rows: Pair[] = [];
      if (r.energyUsed !== undefined && r.energyUsed !== null)
        rows.push(["Energy", formatInt(r.energyUsed)]);
      if (r.feeSun !== undefined && r.feeSun !== null)
        rows.push(["Fee", `${formatSun(r.feeSun)} ${symbol}`]);
      return rows;
    },
    txInfoRows: (r, symbol) => [
      ["TxID", r.txid],
      ["From", r.from ?? ""],
      ["To", r.to ?? ""],
      ["Amount", txInfoAmount(r.amount, r.symbol ? ` ${r.symbol}` : "")],
      ["Status", r.status ?? "unknown"],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
      ["Confirmations", r.confirmations === undefined ? "" : formatInt(r.confirmations)],
      ["Energy", r.energyUsed === undefined ? "" : formatInt(r.energyUsed)],
      ["Fee", r.feeSun === undefined ? "" : `${formatSun(r.feeSun)} ${symbol}`],
    ],
  },
  evm: {
    nativeAmount: (raw, symbol) => `${formatWei(raw)} ${symbol}`,
    feeFallback: (fee, symbol) => `${formatWei(fee)} ${symbol}`,
    addressLabel: "EVM address",
    accountInfoRows: (d, symbol) => {
      const rows: Pair[] = [
        ["Address", String(d.address ?? "")],
        ["Balance", `${formatWei(d.balance)} ${symbol}`],
        ["Nonce", formatInt(d.nonce)],
        // The distinction a reader needs before sending: an address with code may reject a plain
        // transfer. `EOA` rather than a spelled-out phrase: it is the standard name on this chain,
        // it is what json's `eoa` says, and it stays a noun beside `contract` (§4.3).
        ["Type", d.type === "contract" ? "contract" : "EOA"],
      ];
      // Only a contract has code, so only a contract gets the row (§4.3 — an EOA is not a
      // contract with zero bytes).
      if (d.codeSize !== undefined) rows.push(["Code size", `${formatInt(d.codeSize)} bytes`]);
      return rows;
    },
    // Priced in gwei, the unit --max-fee and --priority-fee accept: showing wei here and taking
    // gwei there would make the reader do the nine-zero conversion themselves. JSON keeps wei.
    chainPricesRows: (d, symbol) => {
      const rows: Pair[] = [["Fee model", String(d.feeModel ?? "")]];
      if (d.baseFeeWei !== undefined) rows.push(["Base fee", `${formatGwei(d.baseFeeWei)} gwei`]);
      if (d.priorityFeeWei !== undefined)
        rows.push(["Priority fee", `${formatGwei(d.priorityFeeWei)} gwei`]);
      if (d.gasPriceWei !== undefined)
        rows.push(["Gas price", `${formatGwei(d.gasPriceWei)} gwei`]);
      // The per-gas numbers above answer "how expensive is gas"; this answers "what will a
      // transfer cost me", which is the question most readers actually have.
      if (d.transferCostWei !== undefined) {
        rows.push([
          "Transfer cost",
          `${formatWei(d.transferCostWei)} ${symbol}  (${formatInt(d.transferGas)} gas)`,
        ]);
      }
      return rows;
    },
    chainNodeRows: (d) => {
      const solid = asObj(d.solidBlock);
      const peers = asObj(d.peers);
      return [
        ["Endpoint", orDash(d.endpoint)],
        ["Version", orDash(d.version)],
        // What every signature commits to (EIP-155), and the one field that says whether this
        // endpoint is the chain the caller thinks it is.
        ["Chain id", orDash(d.chainId)],
        headBlockRow(d),
        [
          "Solid block",
          d.solidBlock === null
            ? "—"
            : `#${formatInt(solid.number)}  (${formatInt(d.lagBlocks)} blocks behind head)`,
        ],
        // eth_syncing answers this directly; null means the node would not say, which is not the
        // same as "out of sync".
        ["Syncing", d.inSync === null || d.inSync === undefined ? "—" : d.inSync ? "no" : "yes"],
        [
          "Peers",
          d.peers === null
            ? "—"
            : `${formatInt(peers.connected)} connected / ${formatInt(peers.active)} active`,
        ],
      ];
    },
    // The node's own block object: hex QUANTITIES throughout (§9.1 keeps json verbatim), so every
    // number here is converted for display only. Gas and base fee are what say whether the chain
    // is busy and what it costs — the reason to look at a block at all.
    blockRows: (block, timestampMs) => {
      const txs = Array.isArray(block.transactions) ? block.transactions.length : 0;
      const gasUsed = quantity(block.gasUsed);
      const gasLimit = quantity(block.gasLimit);
      const baseFee = quantity(block.baseFeePerGas);
      const rows: Pair[] = [
        ["Number", block.number === undefined ? "" : `#${formatInt(quantity(block.number))}`],
        ["Hash", String(block.hash ?? "")],
        ["Parent hash", String(block.parentHash ?? "")],
        ["Time", timestampMs ? formatUtc(timestampMs) : "unknown"],
        ["Transactions", String(txs)],
      ];
      if (gasUsed !== undefined) {
        rows.push([
          "Gas used",
          gasLimit === undefined
            ? formatInt(gasUsed)
            : `${formatInt(gasUsed)} / ${formatInt(gasLimit)}`,
        ]);
      }
      // Absent on a pre-1559 chain, where it is not a field with an unknown value but a concept
      // that does not apply. An empty row would claim otherwise.
      if (baseFee !== undefined) rows.push(["Base fee", `${formatGwei(baseFee)} gwei`]);
      return rows;
    },
    // §4.3 calls the nonce the entry point for diagnosing a stuck transaction, and a stuck one is
    // precisely the case where the receipt never arrives — so it is stated from `submitted` on.
    receiptIdentityRows: (r) =>
      r.nonce === undefined ? [] : [["Nonce", formatInt(r.nonce)] as Pair],
    receiptSettlementRows: (r, symbol) =>
      r.feeWei === undefined || r.feeWei === null
        ? []
        : [["Fee", evmFeeRow(r.feeWei, r.gasUsed, r.effectiveGasPriceWei, symbol)] as Pair],
    txInfoRows: (r, symbol) => [
      ["TxID", r.txid],
      ["Type", r.type ?? ""],
      ["From", r.from ?? ""],
      ["To", r.to ?? ""],
      ["Amount", txInfoAmount(r.amount, r.symbol ? ` ${r.symbol}` : "")],
      ["Nonce", r.nonce === undefined ? "" : formatInt(r.nonce)],
      ["Status", r.status ?? "unknown"],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
      // Seconds on the wire (§6.5), milliseconds for the formatter.
      ["Block time", r.blockTime === undefined ? "" : formatUtc(r.blockTime * 1000)],
      ["Confirmations", r.confirmations === undefined ? "" : formatInt(r.confirmations)],
      ["Gas", r.gasUsed === undefined ? "" : formatInt(r.gasUsed)],
      ["Fee", r.feeWei === undefined ? "" : `${formatWei(r.feeWei)} ${symbol}`],
    ],
  },
};

/** hex QUANTITY (or a plain number) → number, for the EVM block view. */
function quantity(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  try {
    return Number(BigInt(String(v)));
  } catch {
    return undefined;
  }
}

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
