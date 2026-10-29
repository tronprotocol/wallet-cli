import { structuredText } from "./structured.js";
import type {
  TxInfoView,
  TxReceiptKind,
  TxReceiptView,
  TxStatusView,
} from "../../../../domain/types/index.js";
import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import { ChainFamily } from "../../../../domain/family/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import type { TxApprovalView } from "../../../../domain/types/index.js";
import { renderApproval } from "./approval.js";
import {
  formatScalar,
  formatDecimal,
  formatGwei,
  formatInt,
  formatSun,
  formatUtc,
  num,
  shorten,
  methodName,
} from "./scalars.js";
import { type Pair, asObj, query, receipt, ok, fail, pending, unknown } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";

export const TxFormatters = {
  txReceipt: ((r, ctx?: TextRenderContext) =>
    renderTxReceipt(r, ctx)) satisfies TextFormatter<TxReceiptView>,
  txStatus: ((r) => {
    const status = {
      confirmed: `confirmed ${ok()}`,
      failed: `failed ${fail()}`,
      pending: `pending ${pending()}`,
      not_found: `not found ${unknown()}`,
    }[r.state];
    return query([
      ["TxID", r.txid],
      ["Status", status],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
      ["Confirmations", r.confirmations === undefined ? "" : formatInt(r.confirmations)],
    ]);
  }) satisfies TextFormatter<TxStatusView>,
  txInfo: ((r, ctx) => {
    return query(FAMILY_RENDER[renderFamily(ctx)].txInfoRows(r, renderSymbol(ctx)));
  }) satisfies TextFormatter<TxInfoView>,
};

function renderTxReceipt(r: TxReceiptView, ctx?: TextRenderContext): string {
  const family = renderFamily(ctx);
  const symbol = renderSymbol(ctx);
  if (r.mode === "dry-run") {
    // Multi-sign fees have their own row; do not repeat them as estimates.
    const body = receipt(pending(), `Dry run ${actionLabel(r.kind)}`, [
      ...receiptRows(r),
      ...(r.multiSignFeeSun === undefined
        ? [["Fee", formatFee(r.fee, family, symbol)] as Pair]
        : []),
      ["Tx", summarizeTx(r.tx ?? r.transaction)],
    ]);
    if (r.transaction) return `${body}\n\n${renderApproval(r.transaction as TxApprovalView)}`;
    // Show skipped pre-broadcast checks; an unperformed check proves nothing.
    return r.checks?.length ? `${body}\n\n${renderChecks(r.checks)}` : body;
  }
  if (r.mode === "build-only") {
    return (
      r.hex ??
      receipt(pending(), `Built ${actionLabel(r.kind)}`, [
        ["Fee", formatFee(r.fee, family, symbol)],
        ["Tx", summarizeTx(r.tx)],
      ])
    );
  }
  if (r.mode === "sign-only") {
    if (r.hex) return r.hex;
    return receipt(ok(), `Signed ${actionLabel(r.kind)}`, [
      ["Address", r.address ?? ""],
      ["TxID", String(r.txId ?? "")],
      ["Fee", r.fee ? formatFee(r.fee, family, symbol) : ""],
      ...signatureRows(r.signed),
    ]);
  }
  const txid = String(r.txId ?? r.hash ?? "");
  const stage = r.stage ?? "submitted";
  const summary = receiptSummary(r, family, symbol);
  const pairs: Pair[] = [...receiptRows(r), ...FAMILY_RENDER[family].receiptIdentityRows(r)];
  if (txid) pairs.push(["TxID", txid]);

  // Settlement costs are only available after confirmation.
  if (stage === "submitted") {
    pairs.push(["Status", submittedStatus(r)]);
    const body = receipt(pending(), summary, pairs);
    const networkFlag = ctx?.net ? ` --network ${ctx.net.id}` : "";
    return txid ? `${body}\n! Track it: wallet-cli tx info${networkFlag} --txid ${txid}` : body;
  }

  if (r.blockNumber !== undefined && r.blockNumber !== null)
    pairs.push(["Block", `#${formatInt(r.blockNumber)}`]);
  pairs.push(...FAMILY_RENDER[family].receiptSettlementRows(r, symbol));
  if (r.kind === "stake-unfreeze")
    pairs.push(["Withdrawable", "after the unlock period — then run `stake withdraw`"]);
  if (stage === "failed") {
    pairs.push(["Status", "failed"]);
    if (r.result) pairs.push(["Reason", String(r.result)]);
    return receipt(fail(), summary, pairs);
  }
  pairs.push(["Status", successStatus(r)]);
  return receipt(ok(), summary, pairs);
}

const hours = (ms: number) => `~${Math.round(ms / 3_600_000)}h`;

function timingNote(r: TxReceiptView): string | undefined {
  if (r.kind === "vote-cast") {
    const interval = r.maintenanceIntervalMs;
    return `tallied at next maintenance cycle${interval === undefined ? "" : ` (${hours(interval)})`}`;
  }
  if (r.kind === "reward-withdraw" && r.withdrawIntervalMs !== undefined) {
    return `next withdrawal available in ${hours(r.withdrawIntervalMs)}`;
  }
  return undefined;
}

function submittedStatus(r: TxReceiptView): string {
  return `pending — ${timingNote(r) ?? "not yet on-chain"}`;
}

function successStatus(r: TxReceiptView): string {
  const note = timingNote(r);
  return note ? `success — ${note}` : "success";
}

function receiptSummary(r: TxReceiptView, family: ChainFamily, symbol: string): string {
  const stakeAmt = r.amountSun !== undefined ? `${formatSun(r.amountSun)} TRX` : "TRX";
  const resource = r.resource ? String(r.resource) : "";
  switch (r.kind) {
    case "stake-freeze":
      return `Staked ${stakeAmt}${resource ? ` for ${resource}` : ""}`;
    case "stake-unfreeze":
      return `Unstaked ${stakeAmt}`;
    case "stake-delegate":
      return `Delegated ${stakeAmt}${resource ? ` of ${resource}` : ""}`;
    case "stake-undelegate":
      return `Reclaimed ${stakeAmt}${resource ? ` of ${resource}` : ""}`;
    case "stake-withdraw":
      return r.withdrawnSun
        ? `Withdrew ${formatSun(r.withdrawnSun)} TRX to balance`
        : "Withdrew expired TRX to balance";
    case "stake-cancel":
      return "Cancelled pending unstakes";
    case "contract-send":
      return `Called ${methodName(String(r.method ?? ""))}`;
    case "contract-deploy":
      return "Contract deployed";
    case "proposal-create":
      return "Proposal created";
    case "proposal-approve":
      return "Proposal approval submitted";
    case "proposal-delete":
      return "Proposal deleted";
    case "witness-create":
      return "Witness registered";
    case "witness-update":
      return "Witness updated";
    case "witness-set-brokerage":
      return "Brokerage set";
    case "contract-clear-abi":
      return "ABI cleared";
    case "contract-set-origin-energy-limit":
      return "Origin energy limit set";
    case "contract-set-user-resource-percent":
      return "User resource ratio set";
    case "vote-cast": {
      const count = Array.isArray(r.votes) ? r.votes.length : 0;
      const across = `across ${formatInt(count)} witness${count === 1 ? "" : "es"}`;
      return r.totalVotes === undefined
        ? `Voted ${across}`
        : `Voted ${formatInt(r.totalVotes)} TP ${across}`;
    }
    case "reward-withdraw":
      return "Withdrew voting/block rewards";
    case "send": {
      const amount = receiptAmount(r, family, symbol);
      return amount ? `Sent ${amount}` : "Sent";
    }
    case "broadcast":
      return "Broadcast";
    case "sign":
      return "Signed";
    case "permission-update":
      return "Permissions updated";
    case "account-activate":
      return "Account activated";
    case "account-set":
      return `On-chain ${r.field ?? "account field"} set`;
    case "asset-issue":
      return "Asset issued";
    case "asset-update":
      return "Asset updated";
    case "asset-participate":
      return "Participated in ICO";
    case "asset-unfreeze":
      return "Frozen supply released";
    case "exchange-create":
      return "Exchange created";
    case "exchange-inject":
      return "Liquidity injected";
    case "exchange-withdraw":
      return "Liquidity withdrawn";
    case "exchange-trade":
      return "Trade completed";
  }
}

// Raw amounts are base units; display whole tokens.
function pairAmount(raw: unknown, decimals: unknown, label: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "";
  const whole = formatDecimal(fromBaseUnits(String(raw), num(decimals, 0)));
  return label ? `${whole} ${String(label)}` : whole;
}

function bothSides(
  r: TxReceiptView,
  a: [unknown, unknown, unknown],
  b: [unknown, unknown, unknown],
): string {
  const left = pairAmount(...(a as [unknown, unknown, unknown]));
  const right = pairAmount(...(b as [unknown, unknown, unknown]));
  return left && right ? `${left} / ${right}` : left || right;
}

function exchangeRows(r: TxReceiptView): Pair[] {
  const rows: Pair[] = [["Exchange id", r.exchangeId === undefined ? "" : formatInt(r.exchangeId)]];
  if (r.kind === "exchange-trade") {
    rows.push(["Trader", String(r.traderAddress ?? "")]);
    rows.push(["Sold", pairAmount(r.soldQuant, r.soldDecimals, r.soldLabel)]);
    if (r.receivedQuant !== undefined) {
      rows.push(["Received", pairAmount(r.receivedQuant, r.receivedDecimals, r.receivedLabel)]);
    } else {
      rows.push([
        "Estimated return",
        pairAmount(r.estimatedReceivedQuant, r.receivedDecimals, r.receivedLabel),
      ]);
    }
    rows.push([
      "Min accepted",
      pairAmount(r.minReceivedQuant, r.receivedDecimals, r.receivedLabel),
    ]);
    return rows;
  }
  rows.push(["Creator", String(r.creatorAddress ?? "")]);
  if (r.kind === "exchange-create") {
    rows.push([
      "Reserves",
      bothSides(
        r,
        [r.firstTokenQuant, r.firstTokenDecimals, r.firstTokenLabel],
        [r.secondTokenQuant, r.secondTokenDecimals, r.secondTokenLabel],
      ),
    ]);
    return rows;
  }
  rows.push([
    r.kind === "exchange-inject" ? "Injected" : "Withdrawn",
    bothSides(
      r,
      [r.tokenQuant, r.tokenDecimals, r.tokenLabel],
      [r.otherTokenQuant, r.otherTokenDecimals, r.otherTokenLabel],
    ),
  ]);
  rows.push([
    "Reserves",
    bothSides(
      r,
      [r.reserveAfter, r.tokenDecimals, r.tokenLabel],
      [r.otherReserveAfter, r.otherTokenDecimals, r.otherTokenLabel],
    ),
  ]);
  return rows;
}

// TRC10 quantities are in minimal units.
function assetAmount(raw: unknown, precision: unknown, name: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "";
  const whole = formatDecimal(fromBaseUnits(String(raw), num(precision, 0)));
  return name ? `${whole} ${String(name)}` : whole;
}

function assetLabel(r: TxReceiptView): string {
  const name = r.name ? String(r.name) : "";
  const id = r.assetId === undefined ? "" : `id ${String(r.assetId)}`;
  if (name && id) return `${name}  (${id})`;
  return name || id;
}

function assetRows(r: TxReceiptView): Pair[] {
  const rows: Pair[] = [["Asset", assetLabel(r)]];
  if (r.kind === "asset-participate") {
    rows.push(["Issuer", String(r.issuerAddress ?? "")]);
    rows.push(["Participant", String(r.participantAddress ?? "")]);
    rows.push(["Paid", r.paidSun === undefined ? "" : `${formatSun(r.paidSun)} TRX`]);
    rows.push(["Received", assetAmount(r.receivedAmount, r.precision, r.name)]);
    return rows;
  }
  rows.push(["Issuer", String(r.issuerAddress ?? "")]);
  if (r.kind === "asset-unfreeze") {
    rows.push(["Released", assetAmount(r.releasedAmount, r.precision, r.name)]);
    rows.push(["Still frozen", assetAmount(r.stillFrozenAmount, r.precision, r.name)]);
    return rows;
  }
  if (r.kind === "asset-issue") {
    rows.push(["Total supply", assetAmount(r.totalSupply, r.precision, "")]);
    rows.push(["Precision", formatInt(r.precision ?? 0)]);
    rows.push(["Price", assetPrice(r)]);
    rows.push(["ICO start time", formatUtc(r.startTime)]);
    rows.push(["ICO end time", formatUtc(r.endTime)]);
  }
  rows.push(["Url", String(r.url ?? "")]);
  rows.push(["Description", String(r.description ?? "")]);
  rows.push(["Free net/account", formatInt(r.freeAssetNetLimit ?? 0)]);
  rows.push(["Public free net", formatInt(r.publicFreeAssetNetLimit ?? 0)]);
  if (r.kind === "asset-issue" && r.frozenSupply?.length) {
    rows.push([`Frozen (${r.frozenSupply.length})`, ""]);
    for (const tranche of r.frozenSupply) {
      rows.push([
        `  ${formatDecimal(fromBaseUnits(tranche.amount, num(r.precision, 0)))}`,
        `for ${formatInt(tranche.days)} days`,
      ]);
    }
  }
  return rows;
}

function assetPrice(r: TxReceiptView): string {
  const [trx, tokens] = String(r.price ?? "").split(":");
  if (!trx || !tokens) return "";
  return `${formatInt(trx)} TRX = ${formatInt(tokens)} ${r.name ? String(r.name) : "tokens"}`;
}

function receiptRows(r: TxReceiptView): Pair[] {
  const rows: Pair[] = [];
  // A zero multi-sign fee is known; undefined means no fee was reported.
  if (r.multiSignFeeSun !== undefined)
    rows.push(["Multi-sign fee", `${formatSun(r.multiSignFeeSun)} TRX`]);
  if (r.kind.startsWith("asset-")) rows.push(...assetRows(r));
  else if (r.kind.startsWith("exchange-")) rows.push(...exchangeRows(r));
  else if (r.kind === "stake-delegate") rows.push(["To", String(r.receiver ?? "")]);
  else if (r.kind === "stake-undelegate") rows.push(["From", String(r.receiver ?? "")]);
  else if (r.kind === "contract-deploy") rows.push(["Address", String(r.contractAddress ?? "")]);
  else if (r.kind === "vote-cast" && Array.isArray(r.votes))
    rows.push([
      "Votes",
      r.votes.map((vote) => `${vote.witness}=${formatInt(vote.count)}`).join(", "),
    ]);
  else if (r.kind === "reward-withdraw")
    rows.push(["Amount", `${formatSun(r.rewardSun ?? r.withdrawnSun ?? 0)} TRX`]);
  else if (r.kind === "account-activate") {
    rows.push(["Address", String(r.address ?? "")]);
    rows.push(["Payer", String(r.payer ?? "")]);
  } else if (r.kind === "account-set") {
    rows.push(["Address", String(r.address ?? "")]);
    rows.push([r.field === "id" ? "ID" : "Name", String(r.value ?? "")]);
  } else if (r.to ?? r.receiver) {
    const address = String(r.to ?? r.receiver);
    rows.push(["To", r.toContact ? `${r.toContact} (${address})` : address]);
  }
  if (r.kind === "contract-send") rows.push(["Contract", String(r.contract ?? "")]);
  if (r.identity) {
    if (r.identity.agentId !== undefined) rows.push(["Agent ID", r.identity.agentId]);
    if (r.identity.operator !== undefined) rows.push(["Operator", r.identity.operator]);
    if (r.identity.uri !== undefined) rows.push(["URI", r.identity.uri]);
    if (r.identity.oldURI !== undefined) rows.push(["Previous URI", r.identity.oldURI]);
    if (r.identity.requestedURI !== undefined)
      rows.push(["Requested URI", r.identity.requestedURI]);
    if (r.identity.newURI !== undefined) rows.push(["Current URI", r.identity.newURI]);
    if (r.identity.oldOwner !== undefined) rows.push(["Previous owner", r.identity.oldOwner]);
    if (r.identity.requestedOwner !== undefined)
      rows.push(["Requested owner", r.identity.requestedOwner]);
    if (r.identity.newOwner !== undefined) rows.push(["Current owner", r.identity.newOwner]);
  }
  if (r.spender !== undefined) rows.push(["Spender", String(r.spender)]);
  if (r.allowance !== undefined) rows.push(["Allowance", allowanceLabel(r)]);
  return rows;
}

// Allowance is already scaled when decimals are known; otherwise it is a raw integer.
function allowanceLabel(r: TxReceiptView): string {
  const value = String(r.allowance);
  if (value === "unlimited") return value;
  const symbol = r.token ?? "";
  const amount = r.allowanceDecimals === undefined ? value : formatDecimal(value);
  return symbol ? `${amount} ${symbol}` : amount;
}

function receiptAmount(r: TxReceiptView, family: ChainFamily, symbol: string): string {
  if (r.rawAmount !== undefined && r.rawAmount !== null && r.rawAmount !== "") {
    const raw = String(r.rawAmount);
    const isToken = r.token !== undefined || r.contract !== undefined || r.assetId !== undefined;
    if (isToken) {
      const human =
        r.decimals !== undefined && r.decimals !== null
          ? fromBaseUnits(raw, num(r.decimals, 0))
          : formatScalar(raw);
      const label =
        r.token ?? r.contract ?? (r.assetId !== undefined ? `asset ${String(r.assetId)}` : "");
      return label ? `${human} ${String(label)}` : human;
    }
    return FAMILY_RENDER[family].nativeAmount(raw, symbol);
  }
  if (r.amountSun) return `${formatSun(r.amountSun)} TRX`;
  return "";
}

function renderChecks(checks: NonNullable<TxReceiptView["checks"]>): string {
  const mark = { ok: "✓", warning: "!", skipped: "–" } as const;
  return ["Checks", ...checks.map((c) => `  ${mark[c.status]} ${c.name}: ${c.detail}`)].join("\n");
}

function actionLabel(kind: TxReceiptKind): string {
  switch (kind) {
    case "send":
      return "tx send";
    case "broadcast":
      return "tx broadcast";
    case "sign":
      return "transaction";
    case "stake-freeze":
      return "stake freeze";
    case "stake-unfreeze":
      return "stake unfreeze";
    case "stake-delegate":
      return "stake delegate";
    case "stake-undelegate":
      return "stake undelegate";
    case "stake-withdraw":
      return "stake withdraw";
    case "stake-cancel":
      return "stake cancel-unfreeze";
    case "contract-send":
      return "contract send";
    case "contract-deploy":
      return "contract deploy";
    case "proposal-create":
      return "proposal create";
    case "proposal-approve":
      return "proposal approve";
    case "proposal-delete":
      return "proposal delete";
    case "witness-create":
      return "witness create";
    case "witness-update":
      return "witness update";
    case "witness-set-brokerage":
      return "witness set-brokerage";
    case "contract-clear-abi":
      return "contract clear-abi";
    case "contract-set-origin-energy-limit":
      return "contract set-origin-energy-limit";
    case "contract-set-user-resource-percent":
      return "contract set-user-resource-percent";
    case "vote-cast":
      return "vote cast";
    case "reward-withdraw":
      return "reward withdraw";
    case "permission-update":
      return "permission update";
    case "account-activate":
      return "account activate";
    case "account-set":
      return "account set";
    case "asset-issue":
      return "asset issue";
    case "asset-update":
      return "asset update";
    case "asset-participate":
      return "asset participate";
    case "asset-unfreeze":
      return "asset unfreeze";
    case "exchange-create":
      return "exchange create";
    case "exchange-inject":
      return "exchange inject";
    case "exchange-withdraw":
      return "exchange withdraw";
    case "exchange-trade":
      return "exchange trade";
  }
}

export function formatFee(fee: unknown, family: ChainFamily, symbol: string): string {
  if (!fee) return "unknown";
  if (typeof fee === "object") {
    const f = asObj(fee);
    if (f.feeSun) return `${formatSun(f.feeSun)} TRX`;
    if (f.bandwidthBurnSunIfNoFreeze) return `${formatSun(f.bandwidthBurnSunIfNoFreeze)} TRX`;
    if (f.minimumFeeSun !== undefined) return `${formatSun(f.minimumFeeSun)} TRX`;
    if (f.energy !== undefined) {
      const energy = Number(f.energy);
      const avail = f.availableEnergy === undefined ? undefined : Number(f.availableEnergy);
      const covered = avail !== undefined && avail >= energy ? " (covered by staked energy)" : "";
      return `~${energy.toLocaleString()} energy${covered}`;
    }
    // maxCostWei is a fee ceiling, not the eventual cost.
    if (f.maxCostWei !== undefined) {
      const total = `\u2264 ${FAMILY_RENDER[family].feeFallback(f.maxCostWei, symbol)}`;
      return f.gasLimit === undefined || f.maxPerGasWei === undefined
        ? total
        : `${total}  (${formatInt(f.gasLimit)} gas × ${formatGwei(f.maxPerGasWei)} gwei max)`;
    }
    if (f.note) return String(f.note);
    // Do not pass unknown objects to the scalar fee formatter.
    return "unknown";
  }
  return FAMILY_RENDER[family].feeFallback(fee, symbol);
}

// Keep signatures complete so they can be copied and used.
function signatureRows(signed: unknown): Pair[] {
  if (typeof signed === "string") return [["Signed", signed]];
  const sigs = (signed as { signature?: unknown } | null)?.signature;
  if (Array.isArray(sigs) && sigs.length > 0) {
    return sigs.map((s, i): Pair => [
      sigs.length === 1 ? "Signature" : `Signature ${i + 1}`,
      String(s),
    ]);
  }
  return [["Signed", summarizeTx(signed)]];
}

function summarizeTx(tx: unknown): string {
  if (!tx || typeof tx !== "object") return formatScalar(tx);
  const o = asObj(tx);
  const hash = o.txid ?? o.txID ?? o.txId ?? o.hash;
  return hash === undefined ? structuredText(o) : shorten(String(hash));
}
