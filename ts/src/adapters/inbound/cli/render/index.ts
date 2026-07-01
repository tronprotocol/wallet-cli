import type { NetworkDescriptor, TxInfoView, TxReceiptKind, TxReceiptView, TxStatusView } from "../../../../domain/types/index.js";
import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import { ChainFamily } from "../../../../domain/family/index.js";
import { RESOURCES, resourceOfRpcCode, type Resource } from "../../../../domain/resources/index.js";
import { sourceLabel } from "../../../../domain/sources/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { formatScalar, formatInt, formatUsd, formatSun, formatTime, formatUtc, num, shorten, quote } from "./scalars.js";
import { type Obj, type Pair, asObj, kv, query, receipt, titled, table, ok, fail, pending, warn } from "./layout.js";

/**
 * Per-family render hooks — the one table that folds the scattered `r.family === tron ? … : …`
 * branches. Adding a chain = one entry here (alongside its FAMILIES + FamilyDef entries).
 */
interface FamilyRenderHooks {
  /** the full TxInfo detail rows (family-shaped: Energy/TRX vs Gas/wei). Reads the flat
   *  TxInfoView and picks its own family's fields — no narrowing cast (no closed union). */
  txInfoRows(r: TxInfoView): Pair[];
  /** native smallest-unit amount → display string (sun→TRX / wei). */
  nativeAmount(raw: string): string;
  /** fee fallback when no structured fee object is present. */
  feeFallback(fee: unknown): string;
  /** address-type label for the per-family address rows. */
  addressLabel: string;
}

const txInfoAmount = (v: string | undefined, suffix: string): string =>
  v === undefined || v === "" ? "" : `${formatScalar(v)}${suffix}`;

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
};

/** humanize a raw base-unit balance: scale by `decimals` when known, else show the raw integer. */
function humanBalance(d: Obj): string {
  return d.decimals !== undefined
    ? fromBaseUnits(String(d.balance ?? "0"), num(d.decimals, 0))
    : formatScalar(d.balance);
}

export const TextFormatters = {
  walletCreated: (verb: "Created" | "Imported", notes: string[]): TextFormatter => (data) =>
    renderWalletCreated(verb, asObj(data), notes),
  walletWatch: ((data) => {
    const d = asObj(data);
    return receipt(ok(), `Added watch-only account ${quote(displayName(d))}`, [
      ["Address", firstAddress(d)],
      ["Note", "read-only; signing operations will be rejected"],
    ]);
  }) satisfies TextFormatter,
  walletLedger: ((data) => renderLedgerImported(asObj(data))) satisfies TextFormatter,
  walletList: ((data) => renderWalletList(Array.isArray(data) ? data.map(asObj) : [])) satisfies TextFormatter,
  walletUse: ((data) => {
    const d = asObj(data);
    return receipt(ok(), `Active account: ${displayName(d)}`, addressPairs(d));
  }) satisfies TextFormatter,
  walletCurrent: ((data) => {
    const d = asObj(data);
    return titled(`Active account: ${displayName(d)}`, addressPairs(d));
  }) satisfies TextFormatter,
  walletRename: ((data) => {
    const d = asObj(data);
    return receipt(ok(), "Renamed account", [
      ["Old label", String(d.previousLabel ?? "")],
      ["New label", displayName(d)],
    ]);
  }) satisfies TextFormatter,
  walletDerive: ((data) => {
    const d = asObj(data);
    return receipt(ok(), `Derived sub-account ${quote(displayName(d))}`, [
      ["Address", firstAddress(d)],
      ["Active", d.active === true ? "yes" : ""],
      ["Note", "shares master mnemonic; no separate backup needed"],
    ]);
  }) satisfies TextFormatter,
  walletDelete: ((data) => {
    const d = asObj(data);
    return receipt(ok(), `Deleted wallet ${String(d.accountId ?? "")}`, [
      ["Secret removed", d.secretRemoved === false ? "no" : "yes"],
      ["New active", d.newActive ? String(d.newActive) : ""],
    ]);
  }) satisfies TextFormatter,
  walletBackup: ((data) => {
    const d = asObj(data);
    return [
      receipt(warn(), `Backup written ${String(d.out ?? "")}`, [
        ["Account ID", String(d.accountId ?? "")],
        ["Secret", secretLabel(d.secretType)],
        ["File mode", String(d.fileMode ?? "0600")],
        ["Bytes", String(d.bytes ?? "?")],
      ]),
      "",
      `${warn()} Secret material was written only to the backup file, never to stdout.`,
    ].join("\n");
  }) satisfies TextFormatter,

  config: ((data) => renderConfig(asObj(data))) satisfies TextFormatter,
  networks: ((data) => table(
    ["Network", "Family", "Chain", "Fee model"],
    (Array.isArray(data) ? data : []).map(asObj).map((n) => [
      String(n.id ?? ""),
      String(n.family ?? ""),
      String(n.chainId ?? ""),
      String(n.feeModel ?? ""),
    ]),
  )) satisfies TextFormatter,

  accountBalance: ((data, ctx) => {
    const d = asObj(data);
    const symbol = d.symbol ? ` ${String(d.symbol)}` : "";
    return query([identity(ctx, d.address), ["Balance", `${humanBalance(d)}${symbol}`]]);
  }) satisfies TextFormatter,
  accountInfo: ((data, ctx) => renderAccountInfo(asObj(data), ctx)) satisfies TextFormatter,
  accountHistory: ((data, ctx) => {
    const d = asObj(data);
    const rows = (Array.isArray(d.records) ? d.records : []).map(asObj).map(historyRow);
    return [`${quote(acct(ctx, d.address))} recent transactions`, table(["Time", "Type", "Amount", "From / To", "Status"], rows)].join("\n");
  }) satisfies TextFormatter,
  tokenBookAdd: ((data) => {
    const d = asObj(data);
    const token = asObj(d.token);
    const verb = d.action === "updated" ? "Updated token book" : "Added to token book";
    return receipt(ok(), verb, [
      ["Name", String(token.name ?? "")],
      ["Symbol", String(token.symbol ?? token.id ?? "")],
      ["Decimals", token.decimals === undefined ? "" : String(token.decimals)],
    ]);
  }) satisfies TextFormatter,
  tokenBookList: ((data) => {
    const d = asObj(data);
    const rows = (Array.isArray(d.tokens) ? d.tokens : []).map(asObj).map((t) => [
      String(t.symbol ?? ""),
      String(t.name ?? ""),
      String(t.source ?? ""),
      String(t.id ?? ""),
    ]);
    return table(["Symbol", "Name", "Source", "Contract / ID"], rows);
  }) satisfies TextFormatter,
  tokenBookRemove: ((data) => {
    const removed = asObj(asObj(data).removed);
    return receipt(ok(), "Removed from token book", [
      ["Name", String(removed.name ?? "")],
      ["Symbol", String(removed.symbol ?? "")],
    ]);
  }) satisfies TextFormatter,
  accountPortfolio: ((data, ctx) => {
    const d = asObj(data);
    const rows = (Array.isArray(d.holdings) ? d.holdings : []).map(asObj).map((h) => [
      String(h.symbol ?? ""),
      formatScalar(h.balance),
      h.priceUsd === null || h.priceUsd === undefined ? "-" : `$${formatUsd(h.priceUsd)}`,
      h.valueUsd === null || h.valueUsd === undefined ? "-" : `$${formatUsd(h.valueUsd)}`,
    ]);
    const total = d.totalValueUsd === null || d.totalValueUsd === undefined ? "-" : `$${formatUsd(d.totalValueUsd)}`;
    const lines = [
      `${quote(acct(ctx, d.address ?? d.account))} Portfolio`,
      table(["Token", "Balance", "Price (USD)", "Value (USD)"], rows),
      `Total ≈ ${total}`,
    ];
    if (d.priceError) lines.push(`${warn()} price warning: ${String(d.priceError)}`);
    return lines.join("\n");
  }) satisfies TextFormatter,

  tokenBalance: ((data, ctx) => {
    const d = asObj(data);
    return query([
      identity(ctx, d.address),
      ["Name", String(d.name ?? "")],
      ["Symbol", String(d.symbol ?? "")],
      ["Balance", humanBalance(d)],
    ]);
  }) satisfies TextFormatter,
  tokenInfo: ((data) => {
    const d = asObj(data);
    return query([
      ["Name", String(d.name ?? d.token_name ?? d.id ?? "")],
      ["Symbol", String(d.symbol ?? d.abbr ?? "")],
      ["Decimals", String(d.decimals ?? d.precision ?? "")],
    ]);
  }) satisfies TextFormatter,

  txReceipt: ((r) => renderTxReceipt(r)) satisfies TextFormatter<TxReceiptView>,
  txStatus: ((r) => {
    // `failed` is computed by the command (tron: result ≠ SUCCESS) — no family branch.
    const status = r.failed ? `failed ${fail()}` : r.confirmed ? `confirmed ${ok()}` : `pending ${pending()}`;
    return query([
      ["TxID", r.txid],
      ["Status", status],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
    ]);
  }) satisfies TextFormatter<TxStatusView>,
  txInfo: ((r) => {
    return query(FAMILY_RENDER[r.family].txInfoRows(r));
  }) satisfies TextFormatter<TxInfoView>,

  contractCall: ((data) => {
    const d = asObj(data);
    return query([
      ["Method", methodName(String(d.method ?? ""))],
      ["Result", `${formatResult(d.result)} (raw)`],
    ]);
  }) satisfies TextFormatter,
  contractInfo: ((data) => renderContractInfo(asObj(data))) satisfies TextFormatter,

  messageSign: ((data) => {
    const d = asObj(data);
    return receipt(ok(), "Signed", [
      ["Address", String(d.address ?? "")],
      ["Signature", String(d.signature ?? "")],
    ]);
  }) satisfies TextFormatter,
  block: ((data) => {
    const block = asObj(asObj(data).block);
    const header = asObj(asObj(block.block_header).raw_data);
    const n = block.number ?? header.number;
    const ts = block.timestamp ?? header.timestamp;
    const txs = Array.isArray(block.transactions) ? block.transactions.length : 0;
    return query([
      ["Number", n === undefined ? "" : `#${formatInt(n)}`],
      ["Time", ts ? formatUtc(ts) : "unknown"],
      ["Transactions", String(txs)],
    ]);
  }) satisfies TextFormatter,
};

export function renderGenericText(command: string, net: NetworkDescriptor | undefined, data: unknown): string {
  const lines: string[] = [`${ok()} ${command}`];
  if (net) lines.push(`  network: ${net.id}`);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Obj)) {
      if (Array.isArray(v) && v.length > 0) {
        lines.push(`  ${k}:`);
        for (const item of v) lines.push(`    - ${formatScalar(item)}`);
      } else {
        lines.push(`  ${k}: ${formatScalar(v)}`);
      }
    }
  } else if (Array.isArray(data)) {
    for (const item of data) lines.push(`  - ${formatScalar(item)}`);
  } else if (data !== undefined && data !== null) {
    lines.push(`  ${String(data)}`);
  }
  return lines.join("\n");
}

function renderWalletCreated(verb: "Created" | "Imported", d: Obj, notes: string[]): string {
  const existing = d.status === "existing";
  const title = existing ? "Existing wallet" : `${verb} wallet`;
  const lines = [
    receipt(existing ? warn() : ok(), `${title} ${quote(displayName(d))}`, [
      ["Account ID", String(d.accountId ?? "")],
      ["Type", typeLabel(d.type)],
      ...addressPairs(d),
      ["Active", d.active === true ? "yes" : ""],
    ]),
  ];
  if (notes.length) lines.push("", ...notes.map((n) => `${warn()} ${n}`));
  return lines.join("\n");
}

function renderLedgerImported(d: Obj): string {
  const existing = d.status === "existing";
  return [
    receipt(existing ? warn() : ok(), `${existing ? "Existing Ledger account" : "Registered Ledger account"} ${quote(displayName(d))}`, [
      ["Account ID", String(d.accountId ?? "")],
      ["App", String(d.family ?? "")],
      ["Path", String(d.path ?? "")],
      ...addressPairs(d),
    ]),
    "",
    `${warn()} No private key is stored locally. Signing requires device confirmation.`,
  ].join("\n");
}

function renderWalletList(items: Obj[]): string {
  if (items.length === 0) return "No wallets found.";
  const rows = items.map((d) => [
    displayName(d),
    typeLabel(d.type),
    firstAddress(d),
    d.active ? "*" : "",
  ]);
  return table(["Label", "Type", "Address", "Active"], rows);
}

function renderAccountInfo(d: Obj, ctx: TextRenderContext): string {
  const account = asObj(d.account);
  const owner = asObj(account.owner_permission);
  const active = Array.isArray(account.active_permission) ? account.active_permission.length : 0;
  const created = account.create_time ? new Date(Number(account.create_time)).toISOString().slice(0, 10) : "";
  const ownerKeys = Array.isArray(owner.keys) ? owner.keys.length : "?";
  const resources = asObj(d.resources);
  const bandwidth = asObj(resources.bandwidth);
  const energy = asObj(resources.energy);
  const pairs: Pair[] = [];
  if (ctx.accountLabel) pairs.push(["Label", ctx.accountLabel]);
  pairs.push(["Address", String(d.address ?? "")]);
  pairs.push(["Balance", `${formatSun(account.balance)} TRX`]);
  const staked = stakedSummary(account);
  if (staked) pairs.push(["Staked", staked]);
  if (resources.energy) pairs.push(["Energy", `used ${formatInt(energy.used)} / ${formatInt(energy.limit)}`]);
  if (resources.bandwidth) pairs.push(["Bandwidth", `used ${formatInt(bandwidth.used)} / ${formatInt(bandwidth.limit)}`]);
  pairs.push(["Created", created]);
  pairs.push(["Permissions", `owner ${String(owner.threshold ?? "?")}-of-${ownerKeys}, ${active} active group${active === 1 ? "" : "s"}`]);
  return query(pairs);
}

/** Sum FreezeBalanceV2 stakes into a "<total> TRX (energy <e> + bandwidth <b>)" summary. */
function stakedSummary(account: Obj): string {
  const frozen = Array.isArray(account.frozenV2) ? account.frozenV2.map(asObj) : [];
  // frozenV2's bandwidth entries carry no `type`, so an unrecognized code folds into bandwidth.
  const sums = new Map<Resource, bigint>(RESOURCES.map((r) => [r, 0n]));
  for (const f of frozen) {
    const r = resourceOfRpcCode(String(f.type ?? "")) ?? "bandwidth";
    sums.set(r, (sums.get(r) ?? 0n) + BigInt(Number(f.amount ?? 0)));
  }
  const total = RESOURCES.reduce((t, r) => t + (sums.get(r) ?? 0n), 0n);
  if (total === 0n) return "";
  const parts = RESOURCES.map((r) => `${r} ${formatSun(sums.get(r) ?? 0n)}`).join(" + ");
  return `${formatSun(total)} TRX (${parts})`;
}

function renderContractInfo(d: Obj): string {
  let names: string[];
  let count: number;
  if (Array.isArray(d.methods)) {
    names = d.methods.map(String);
    count = num(d.functionCount, names.length);
  } else {
    const contract = asObj(d.contract);
    const info = asObj(d.info);
    const abi = contract.abi ?? info.abi ?? contract.ABI ?? info.ABI;
    const nestedEntries = asObj(abi).entrys;
    const entries: unknown[] = Array.isArray(abi) ? abi : Array.isArray(nestedEntries) ? nestedEntries : [];
    const methods = entries.map(asObj).filter((e) => e.type === "Function" || e.type === "function");
    names = methods.map((e) => e.name).filter(Boolean).map(String);
    count = methods.length;
  }
  const name = String(d.name ?? asObj(d.contract).name ?? asObj(d.info).name ?? "");
  const preview = names.slice(0, 3).join(" / ");
  return query([
    ["Contract", String(d.address ?? "")],
    ["Name", name],
    ["Methods", `${count}${preview ? ` (${preview}${count > 3 ? " …" : ""})` : ""}`],
  ]);
}

function renderConfig(d: Obj): string {
  if ("input" in d) {
    return receipt(ok(), "Set config", [
      ["Key", String(d.key)],
      ["Value", configValue(d.value)],
    ]);
  }
  if ("key" in d) return kv([[String(d.key), configValue(d.value)]], "");
  return kv(Object.entries(d).map(([k, v]) => [k, configValue(v)] as Pair), "");
}

/** config values keep their literal form (no thousands grouping, raw key names). */
function configValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  return v === null || v === undefined ? "" : String(v);
}

/** Default-mode broadcast/dry-run/sign-only receipt for tx/stake/contract signing commands.
 *  Narrows on the typed `kind`/`family` — no stringly command-id matching, no alias probing. */
function renderTxReceipt(r: TxReceiptView): string {
  if (r.mode === "dry-run") {
    return receipt(pending(), `Dry run ${actionLabel(r.kind)}`, [
      ["Fee", formatFee(r.fee, r.family)],
      ["Tx", summarizeTx(r.tx)],
    ]);
  }
  if (r.mode === "sign-only") {
    return receipt(ok(), `Signed ${actionLabel(r.kind)}`, [
      ["Fee", formatFee(r.fee, r.family)],
      ["Signed", summarizeTx(r.signed)],
    ]);
  }
  const txid = String(r.txId ?? r.hash ?? "");
  const stage = r.stage ?? "submitted";
  const summary = receiptSummary(r);
  const pairs: Pair[] = [...receiptRows(r)];
  if (txid) pairs.push(["TxID", txid]);

  // submitted (default, non-blocking): txid only, no fee/energy yet — those need confirmation.
  if (stage === "submitted") {
    pairs.push(["Status", "pending — not yet on-chain"]);
    const body = receipt(pending(), summary, pairs);
    return txid ? `${body}\n! Track it: wallet-cli tx info --txid ${txid}` : body;
  }

  // confirmed / failed (after --wait): real on-chain block / fee / energy / result.
  if (r.blockNumber) pairs.push(["Block", `#${formatInt(r.blockNumber)}`]);
  if (r.energyUsed) pairs.push(["Energy", formatInt(r.energyUsed)]);
  if (r.feeSun) pairs.push(["Fee", `${formatSun(r.feeSun)} TRX`]);
  if (r.kind === "stake-unfreeze") pairs.push(["Withdrawable", "after the unlock period — then run `stake withdraw`"]);
  if (stage === "failed") {
    pairs.push(["Status", "failed"]);
    if (r.result) pairs.push(["Reason", String(r.result)]);
    return receipt(fail(), summary, pairs);
  }
  pairs.push(["Status", "success"]);
  return receipt(ok(), summary, pairs);
}

/** the verb-phrase summary for a broadcast receipt, by action kind. */
function receiptSummary(r: TxReceiptView): string {
  const stakeAmt = r.amountSun !== undefined ? `${formatSun(r.amountSun)} TRX` : "TRX";
  const resource = r.resource ? String(r.resource) : "";
  switch (r.kind) {
    case "stake-freeze": return `Staked ${stakeAmt}${resource ? ` for ${resource}` : ""}`;
    case "stake-unfreeze": return `Unstaked ${stakeAmt}`;
    case "stake-delegate": return `Delegated ${stakeAmt}${resource ? ` of ${resource}` : ""}`;
    case "stake-undelegate": return `Reclaimed ${stakeAmt}${resource ? ` of ${resource}` : ""}`;
    case "stake-withdraw": return r.withdrawnSun ? `Withdrew ${formatSun(r.withdrawnSun)} TRX to balance` : "Withdrew expired TRX to balance";
    case "stake-cancel": return "Cancelled pending unstakes";
    case "contract-send": return `Called ${methodName(String(r.method ?? ""))}`;
    case "contract-deploy": return "Contract deployed";
    case "send": {
      const amount = receiptAmount(r);
      return amount ? `Sent ${amount}` : "Sent";
    }
    case "broadcast": return "Broadcast";
  }
}

/** action-specific extra rows (To/From/Address/Contract), by kind. */
function receiptRows(r: TxReceiptView): Pair[] {
  const rows: Pair[] = [];
  if (r.kind === "stake-delegate") rows.push(["To", String(r.receiver ?? "")]);
  else if (r.kind === "stake-undelegate") rows.push(["From", String(r.receiver ?? "")]);
  else if (r.kind === "contract-deploy") rows.push(["Address", String(r.contractAddress ?? "")]);
  else if (r.to ?? r.receiver) rows.push(["To", String(r.to ?? r.receiver)]);
  if (r.kind === "contract-send") rows.push(["Contract", String(r.contract ?? "")]);
  return rows;
}

/** broadcast-receipt amount: token-aware (symbol/decimals when known, else the contract/asset-id
 *  identifier for raw-amount sends), native smallest-unit → coin only when no token is involved. */
function receiptAmount(r: TxReceiptView): string {
  if (r.rawAmount !== undefined && r.rawAmount !== null && r.rawAmount !== "") {
    const raw = String(r.rawAmount);
    const isToken = r.token !== undefined || r.contract !== undefined || r.assetId !== undefined;
    if (isToken) {
      const human = r.decimals !== undefined && r.decimals !== null ? fromBaseUnits(raw, num(r.decimals, 0)) : formatScalar(raw);
      const label = r.token ?? r.contract ?? (r.assetId !== undefined ? `asset ${String(r.assetId)}` : "");
      return label ? `${human} ${String(label)}` : human;
    }
    return FAMILY_RENDER[r.family].nativeAmount(raw);
  }
  if (r.amountSun) return `${formatSun(r.amountSun)} TRX`;
  return "";
}

/** human label for an action kind, e.g. "send" → "tx send" (for dry-run/sign-only headers). */
function actionLabel(kind: TxReceiptKind): string {
  switch (kind) {
    case "send": return "tx send";
    case "broadcast": return "tx broadcast";
    case "stake-freeze": return "stake freeze";
    case "stake-unfreeze": return "stake unfreeze";
    case "stake-delegate": return "stake delegate";
    case "stake-undelegate": return "stake undelegate";
    case "stake-withdraw": return "stake withdraw";
    case "stake-cancel": return "stake cancel-unfreeze";
    case "contract-send": return "contract send";
    case "contract-deploy": return "contract deploy";
  }
}

function historyRow(r: Obj): string[] {
  const ts = r.time ?? r.block_timestamp ?? r.timestamp;
  const type = r.type ?? r.transfer_type ?? r.direction ?? "";
  const amount = r.amount ?? r.value ?? r.quant ?? "";
  const symbol = r.symbol ?? (r.token_info && typeof r.token_info === "object" ? asObj(r.token_info).symbol : undefined);
  const counterparty = r.counterparty ?? r.to ?? r.from ?? "";
  const status = r.status === "failed" || r.confirmed === false ? "failed" : "ok";
  return [formatTime(ts), String(type), `${formatScalar(amount)}${symbol ? ` ${String(symbol)}` : ""}`, String(counterparty), status === "ok" ? ok() : fail()];
}

/** account display id for receipts: the centrally-injected --account label when present,
 *  else the full on-chain address. Callers add their own quoting where wanted. */
function acct(ctx: TextRenderContext, address: unknown): string {
  return ctx.accountLabel ?? String(address ?? "");
}

/** identity field pair: prefer the account label, else show the full address — the field
 *  name tracks the value's real meaning (§0.4). */
function identity(ctx: TextRenderContext, address: unknown): Pair {
  return ctx.accountLabel ? ["Label", ctx.accountLabel] : ["Address", String(address ?? "")];
}

function displayName(d: Obj): string {
  return String(d.label ?? d.accountId ?? d.id ?? "unnamed");
}

/** non-empty address entries — drops families whose address is blank/absent. */
function nonEmptyAddressEntries(d: Obj): Pair[] {
  return Object.entries(asObj(d.addresses))
    .filter(([, address]) => typeof address === "string" && address.length > 0)
    .map(([family, address]) => [family, String(address)] as Pair);
}

function firstAddress(d: Obj): string {
  const first = nonEmptyAddressEntries(d)[0];
  return first ? first[1] : "";
}

/** per-family address field pairs, addresses shown in full (§0.4 ②). */
function addressPairs(d: Obj): Pair[] {
  return nonEmptyAddressEntries(d).map(([family, address]) => [familyAddressLabel(family), address] as Pair);
}

function familyAddressLabel(family: string): string {
  return FAMILY_RENDER[family as ChainFamily]?.addressLabel ?? `${family} address`;
}

function typeLabel(v: unknown): string {
  return sourceLabel(v);
}

function secretLabel(v: unknown): string {
  switch (v) {
    case "mnemonic": return "recovery phrase";
    case "privateKey": return "private key";
    default: return String(v ?? "secret");
  }
}

function methodName(sig: string): string {
  return sig.replace(/\(.*/, "") || sig;
}

function formatResult(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => formatScalar(x)).join(", ");
  return formatScalar(v);
}

function formatFee(fee: unknown, family: ChainFamily): string {
  if (!fee) return "unknown";
  if (typeof fee === "object") {
    const f = asObj(fee);
    if (f.feeSun) return `${formatSun(f.feeSun)} TRX`;
    if (f.bandwidthBurnSunIfNoFreeze) return `${formatSun(f.bandwidthBurnSunIfNoFreeze)} TRX`;
    // energy estimate (TRC20/contract via estimateResources): no sun figure — staked energy may
    // cover it. Report the estimated energy + whether the account's available energy covers it.
    if (f.energy !== undefined) {
      const energy = Number(f.energy);
      const avail = f.availableEnergy === undefined ? undefined : Number(f.availableEnergy);
      const covered = avail !== undefined && avail >= energy ? " (covered by staked energy)" : "";
      return `~${energy.toLocaleString()} energy${covered}`;
    }
    if (f.note) return String(f.note);
  }
  return FAMILY_RENDER[family].feeFallback(fee);
}

function summarizeTx(tx: unknown): string {
  if (!tx || typeof tx !== "object") return formatScalar(tx);
  const o = asObj(tx);
  return shorten(String(o.txid ?? o.txID ?? o.hash ?? JSON.stringify(o)));
}
