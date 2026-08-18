import type {
  TronLinkMultisigView,
  TxApprovalView,
  TxSignTransactionView,
  TxSignView,
} from "../../../../domain/types/index.js";
import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import { formatAtWithRelative, formatInt, formatSun } from "./scalars.js";
import { ok, query, receipt, table } from "./layout.js";
import { renderApproval } from "./approval.js";
import { TxFormatters } from "./tx.js";

function renderTronLink(value: TronLinkMultisigView): string {
  if ("transactions" in value) {
    const heading = `Multi-sig transactions — TronLink service (${value.total} total)`;
    // A table shorter than the total would otherwise read as a complete queue.
    const omitted =
      value.unreadable > 0
        ? `\n! ${formatInt(value.unreadable)} record(s) could not be decoded by this client and are not shown`
        : "";
    if (value.transactions.length === 0) return `${heading}\nNo transactions found.${omitted}`;
    const rows = value.transactions.map((transaction) => {
      const amount = transaction.rawAmount
        ? transaction.contractType === "TransferContract"
          ? `${formatSun(transaction.rawAmount)} TRX`
          : `${transaction.rawAmount} base units`
        : "";
      // State is service history; validation is an independent local safety assessment.
      // Only a verified pending record may be promoted to an actionable "awaiting you" state.
      const state =
        transaction.verified && transaction.awaitingMySignature
          ? "awaiting you"
          : transaction.state;
      return [
        transaction.txId,
        transaction.contractType,
        amount,
        state,
        transaction.verified ? "verified" : "unverified",
        `${formatInt(transaction.currentWeight)} / ${formatInt(transaction.permission.threshold)}`,
        formatAtWithRelative(transaction.expiration),
      ];
    });
    const hint = value.transactions.some((t) => t.verified && t.awaitingMySignature)
      ? "\n! Co-sign one with: wallet-cli tx multisig --sign <txId>"
      : "";
    return `${heading}\n${table(
      ["TxID", "Type", "Amount", "State", "Validation", "Progress", "Expires"],
      rows,
    )}${omitted}${hint}`;
  }
  if (value.action === "watch") {
    return receipt(ok(), "Stopped watching TronLink multi-sig service", [
      ["Address", value.address],
      ["Notifications", formatInt(value.notifications)],
    ]);
  }
  if (value.action === "create") {
    const created = receipt(ok(), "Created on TronLink multi-sig service", [
      ["Signer", `${value.signer}  (weight ${formatInt(value.signerWeight)})`],
      ["Hex", value.hex],
    ]);
    const next = value.transaction.thresholdReached
      ? thresholdHint(value.transaction.txId, value.hex)
      : `\n! Each co-signer signs it with: wallet-cli tx multisig --sign ${value.transaction.txId}`;
    return `${created}\n\n${renderApproval(value.transaction)}${next}`;
  }
  const signed = receipt(ok(), "Signed & submitted", [
    ["Signer", `${value.signer}  (weight ${formatInt(value.signerWeight)})`],
    ["Hex", value.hex],
  ]);
  const broadcast = value.transaction.thresholdReached
    ? thresholdHint(value.transaction.txId, value.hex)
    : "";
  return `${signed}\n\n${renderApproval(value.transaction)}${broadcast}`;
}

/** The service broadcasts on its own once the threshold is met, so confirm before broadcasting. */
function thresholdHint(txId: string, hex: string): string {
  return (
    `\n! Threshold reached — the service broadcasts it. Confirm: wallet-cli tx info --txid ${txId}` +
    `\n  Not on chain: wallet-cli tx broadcast --hex ${hex}`
  );
}

function renderSign(value: TxSignView): string {
  const artifact = value.out ? `written to ${value.out}` : value.hex;
  const signer = value.checked
    ? `${value.signer}  (weight ${formatInt(value.signerWeight)})`
    : value.signer;
  const action = receipt(ok(), "Signature added", [
    ["Signer", signer],
    ["Hex", artifact],
  ]);
  if (!value.checked || !value.approval) {
    return (
      `${action}\n\n${renderSignedTransaction(value.transaction)}\n` +
      "! Approval state was not checked online. Inspect it with: " +
      `wallet-cli tx approvals ${value.out ? `--file ${value.out}` : "--hex <hex-above>"}`
    );
  }
  const next = value.approval.thresholdReached
    ? `\n! Broadcast it: wallet-cli tx broadcast ${value.out ? `--file ${value.out}` : "--hex <hex-above>"}`
    : "";
  return `${action}\n\n${renderApproval(value.approval)}${next}`;
}

function renderSignedTransaction(value: TxSignTransactionView): string {
  const permissionKind =
    value.permissionId === 0 ? "owner" : value.permissionId === 1 ? "witness" : "active";
  const label = value.operation ?? value.contractType;
  const type = !value.rawAmount
    ? label
    : value.contractType === "TransferContract"
      ? `${label} — ${formatSun(value.rawAmount)} TRX`
      : `${label} — ${value.rawAmount} base units`;
  const transaction = query([
    ["TxID", value.txId],
    ["Type", type],
    ["From", value.from ?? ""],
    ["To", value.to ?? ""],
    ["Permission", `${permissionKind} (id ${value.permissionId})`],
    ["Signatures", formatInt(value.signatures)],
    ["Expires", `${formatAtWithRelative(value.expiration)}${value.expired ? " [EXPIRED]" : ""}`],
  ]);
  return `Transaction (local inspection)\n${transaction
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}`;
}

export const MultisigFormatters = {
  txApprovals: ((value) => renderApproval(value)) satisfies TextFormatter<TxApprovalView>,
  txSign: ((value: TxSignView | any, ctx?: TextRenderContext) =>
    value.kind === "tx-sign"
      ? renderSign(value)
      : TxFormatters.txReceipt(value, ctx)) satisfies TextFormatter,
  txTronLinkMultisig: ((value: TronLinkMultisigView) =>
    renderTronLink(value)) satisfies TextFormatter<TronLinkMultisigView>,
};
