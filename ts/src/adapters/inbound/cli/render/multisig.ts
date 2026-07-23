import type { TxApprovalView, TxSignView } from "../../../../domain/types/index.js";
import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import { formatAtWithRelative, formatInt, formatSun } from "./scalars.js";
import { ok, query, receipt, table } from "./layout.js";
import { TxFormatters } from "./tx.js";

function transactionType(value: TxApprovalView): string {
  const label = value.operation ? `${value.operation} (${value.contractType})` : value.contractType;
  if (!value.rawAmount) return label;
  return value.contractType === "TransferContract"
    ? `${label} — ${formatSun(value.rawAmount)} TRX`
    : `${label} — ${value.rawAmount} base units`;
}

function renderApproval(value: TxApprovalView): string {
  const permissionKind = value.permission.id === 0 ? "owner" : value.permission.id === 1 ? "witness" : "active";
  const expires = `${formatAtWithRelative(value.expiration)}${value.expired ? " [EXPIRED]" : ""}`;
  const transaction = query([
    ["TxID", value.txId],
    ["Type", transactionType(value)],
    ["From", value.from ?? ""],
    ["To", value.to ?? ""],
    ["Permission", `${permissionKind} "${value.permission.name}" (id ${value.permission.id})  threshold ${formatInt(value.permission.threshold)}`],
    ["Expires", expires],
  ]);
  const progress = value.thresholdReached
    ? `Progress  ${formatInt(value.currentWeight)} / ${formatInt(value.permission.threshold)} — threshold reached`
    : `Progress  ${formatInt(value.currentWeight)} / ${formatInt(value.permission.threshold)} — ${formatInt(value.missingWeight)} more weight needed`;
  const approved = value.approved.length === 0
    ? "No approved signers."
    : table(
        ["Approved signer", "Weight"],
        value.approved.map((signer) => [signer.address, formatInt(signer.weight)]),
      );
  const expired = value.expired ? "\n! Transaction expired; build a new transaction before collecting signatures." : "";
  return `Transaction\n${transaction.split("\n").map((line) => `  ${line}`).join("\n")}\n\n${progress}\n${approved}${expired}`;
}

function renderSign(value: TxSignView): string {
  const artifact = value.out ? `written to ${value.out}` : value.hex;
  const action = receipt(ok(), "Signature added", [
    ["Signer", `${value.signer}  (weight ${formatInt(value.signerWeight)})`],
    ["Hex", artifact],
  ]);
  const next = value.transaction.thresholdReached
    ? `\n! Broadcast it: wallet-cli tx broadcast ${value.out ? `--file ${value.out}` : "--hex <hex-above>"}`
    : "";
  return `${action}\n\n${renderApproval(value.transaction)}${next}`;
}

export const MultisigFormatters = {
  txApprovals: ((value) => renderApproval(value)) satisfies TextFormatter<TxApprovalView>,
  txSign: ((value: TxSignView | any, ctx?: TextRenderContext) =>
    value.kind === "tx-sign"
      ? renderSign(value)
      : TxFormatters.txReceipt(value, ctx)) satisfies TextFormatter,
};
