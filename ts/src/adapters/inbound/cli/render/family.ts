import type { TxInfoView, TxReceiptView } from "../../../../domain/types/index.js";
import { RESOURCES, resourceOfRpcCode, type Resource } from "../../../../domain/resources/index.js";
import type { TextRenderContext } from "../contracts/index.js";
import { ChainFamily } from "../../../../domain/family/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";
import { formatScalar, formatInt, formatGwei, formatSun, formatUtc, formatWei } from "./scalars.js";
import { asObj, type Obj, type Pair } from "./layout.js";

// Native symbols belong to networks, not families (e.g. ETH and BNB share EVM).
interface FamilyRenderHooks {
  txInfoRows(r: TxInfoView, symbol: string): Pair[];
  // Raw native amounts are SUN for TRON and wei for EVM.
  nativeAmount(raw: string, symbol: string): string;
  feeFallback(fee: unknown, symbol: string): string;
  addressLabel: string;
  accountInfoRows(d: Obj, symbol: string): Pair[];
  chainPricesRows(d: Obj, symbol: string): Pair[];
  chainNodeRows(d: Obj): Pair[];
  blockRows(block: Obj, timestampMs: number | undefined): Pair[];
  receiptIdentityRows(r: TxReceiptView): Pair[];
  receiptSettlementRows(r: TxReceiptView, symbol: string): Pair[];
}

const txInfoAmount = (v: string | undefined, suffix: string): string =>
  v === undefined || v === "" ? "" : `${formatScalar(v)}${suffix}`;

function headBlockRow(d: Obj): Pair {
  const head = asObj(d.headBlock);
  const headTimestamp = Number(head.timestamp ?? 0);
  const ageSeconds =
    headTimestamp > 0 ? Math.max(0, Math.round((Date.now() - headTimestamp) / 1000)) : null;
  const sync = d.inSync ? "in sync" : "lagging";
  const age = ageSeconds === null ? "—" : `~${ageSeconds}s ago — ${sync}`;
  return ["Head block", `#${formatInt(head.number)}  ${nodeTime(head.timestamp)} (${age})`];
}

// Input is epoch milliseconds.
function nodeTime(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n).toISOString().replace("T", " ").slice(0, 19);
}

function orDash(v: unknown): string {
  return v === null || v === undefined ? "—" : String(v);
}

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
        ["Type", d.type === "contract" ? "contract" : "EOA"],
      ];
      if (d.codeSize !== undefined) rows.push(["Code size", `${formatInt(d.codeSize)} bytes`]);
      return rows;
    },
    chainPricesRows: (d, symbol) => {
      const rows: Pair[] = [["Fee model", String(d.feeModel ?? "")]];
      if (d.baseFeeWei !== undefined) rows.push(["Base fee", `${formatGwei(d.baseFeeWei)} gwei`]);
      if (d.priorityFeeWei !== undefined)
        rows.push(["Priority fee", `${formatGwei(d.priorityFeeWei)} gwei`]);
      if (d.gasPriceWei !== undefined)
        rows.push(["Gas price", `${formatGwei(d.gasPriceWei)} gwei`]);
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
        ["Chain id", orDash(d.chainId)],
        headBlockRow(d),
        [
          "Solid block",
          d.solidBlock === null
            ? "—"
            : `#${formatInt(solid.number)}  (${formatInt(d.lagBlocks)} blocks behind head)`,
        ],
        ["Syncing", d.inSync === null || d.inSync === undefined ? "—" : d.inSync ? "no" : "yes"],
        [
          "Peers",
          d.peers === null
            ? "—"
            : `${formatInt(peers.connected)} connected / ${formatInt(peers.active)} active`,
        ],
      ];
    },
    // EVM block numbers arrive as hex QUANTITY values.
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
      // Pre-1559 chains have no base fee.
      if (baseFee !== undefined) rows.push(["Base fee", `${formatGwei(baseFee)} gwei`]);
      return rows;
    },
    // Show the nonce before confirmation so stuck transactions can be identified.
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
      // Block time is in seconds; formatUtc takes milliseconds.
      ["Block time", r.blockTime === undefined ? "" : formatUtc(r.blockTime * 1000)],
      ["Confirmations", r.confirmations === undefined ? "" : formatInt(r.confirmations)],
      ["Gas", r.gasUsed === undefined ? "" : formatInt(r.gasUsed)],
      ["Fee", r.feeWei === undefined ? "" : `${formatWei(r.feeWei)} ${symbol}`],
    ],
  },
};

// Decode EVM hex QUANTITY values or plain numbers.
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

// Require a resolved network to avoid labelling amounts with the wrong currency.
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

function stakedSummary(account: Obj, symbol: string): string {
  const frozen = Array.isArray(account.frozenV2) ? account.frozenV2.map(asObj) : [];
  // Bandwidth entries in frozenV2 omit type.
  const sums = new Map<Resource, bigint>(RESOURCES.map((r) => [r, 0n]));
  for (const f of frozen) {
    const r = resourceOfRpcCode(String(f.type ?? "")) ?? "bandwidth";
    const amount = safeUnsignedBigInt(f.amount ?? 0);
    // Omit the summary if an amount is invalid or has already lost precision.
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
