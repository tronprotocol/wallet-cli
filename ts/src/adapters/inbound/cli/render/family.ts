import type { TxInfoView, TxReceiptView } from "../../../../domain/types/index.js";
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
  blockRows(data: Obj): Pair[];
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
      const permissions = asObj(d.permissions);
      const active = Number(permissions.activeGroups);
      const created =
        typeof d.createdAt === "number" ? new Date(d.createdAt).toISOString().slice(0, 10) : "";
      const resources = asObj(d.resources);
      const bandwidth = asObj(resources.bandwidth);
      const energy = asObj(resources.energy);
      const rows: Pair[] = [["Address", String(d.address ?? "")]];
      rows.push(["Balance", `${formatSun(d.balanceSun)} ${symbol}`]);
      const staked = asObj(d.staked);
      if (staked.totalSun !== undefined && staked.totalSun !== "0")
        rows.push(["Staked", stakedSummary(staked, symbol)]);
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
        d.permissions
          ? `owner ${formatInt(permissions.ownerThreshold)}-of-${formatInt(permissions.ownerKeys)}, ${active} active group${active === 1 ? "" : "s"}`
          : "—",
      ]);
      return rows;
    },
    chainPricesRows: (d, symbol) => {
      const energy = asObj(d.energy);
      const bandwidth = asObj(d.bandwidth);
      return [
        ["Energy price", `${formatInt(energy.currentSunPerUnit)} sun / unit    (current)`],
        ["Bandwidth price", `${formatInt(bandwidth.currentSunPerUnit)} sun / unit  (current)`],
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
    blockRows: (d) => [
      ["Number", `#${formatInt(d.number)}`],
      ["Time", formatUtc(d.timestampMs)],
      ["Transactions", String(d.transactionCount)],
    ],
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
    // Reads the normalized block fields of the result, not the node's block.
    blockRows: (block) => {
      const timestampMs = typeof block.timestamp === "number" ? block.timestamp : undefined;
      const rows: Pair[] = [
        ["Number", block.number === undefined ? "" : `#${formatInt(block.number)}`],
        ["Hash", String(block.hash ?? "")],
        ["Parent hash", String(block.parentHash ?? "")],
        ["Time", timestampMs ? formatUtc(timestampMs) : "unknown"],
        [
          "Transactions",
          block.transactionCount === undefined ? "unknown" : formatInt(block.transactionCount),
        ],
      ];
      if (block.gasUsed !== undefined) {
        rows.push([
          "Gas used",
          block.gasLimit === undefined
            ? formatInt(block.gasUsed)
            : `${formatInt(block.gasUsed)} / ${formatInt(block.gasLimit)}`,
        ]);
      }
      // Pre-1559 chains have no base fee.
      if (block.baseFeeWei !== undefined) {
        rows.push(["Base fee", `${formatGwei(block.baseFeeWei)} gwei`]);
      }
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

function stakedSummary(staked: Obj, symbol: string): string {
  const parts = [
    `energy ${formatSun(staked.energySun)}`,
    `bandwidth ${formatSun(staked.bandwidthSun)}`,
  ];
  if (staked.tronPowerSun !== "0") parts.push(`TRON Power ${formatSun(staked.tronPowerSun)}`);
  return `${formatSun(staked.totalSun)} ${symbol} (${parts.join(" + ")})`;
}
