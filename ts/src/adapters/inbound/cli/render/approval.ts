import type { TxApprovalView } from "../../../../domain/types/index.js";
import { formatAtWithRelative, formatInt, formatSun } from "./scalars.js";
import { query, table } from "./layout.js";

function transactionType(value: TxApprovalView): string {
  // human name only — the machine-readable contractType enum stays in json (doc §3.2). The raw
  // enum is the fallback, since an unmapped contract type has no human name to show.
  const label = value.operation ?? value.contractType;
  if (!value.rawAmount) return label;
  return value.contractType === "TransferContract"
    ? `${label} — ${formatSun(value.rawAmount)} TRX`
    : `${label} — ${value.rawAmount} base units`;
}

export function renderApproval(value: TxApprovalView): string {
  const permissionKind =
    value.permission.id === 0 ? "owner" : value.permission.id === 1 ? "witness" : "active";
  const expires = `${formatAtWithRelative(value.expiration)}${value.expired ? " [EXPIRED]" : ""}`;
  const transaction = query([
    ["TxID", value.txId],
    ["Type", transactionType(value)],
    ["From", value.from ?? ""],
    ["To", value.to ?? ""],
    [
      "Permission",
      `${permissionKind} "${value.permission.name}" (id ${value.permission.id})  threshold ${formatInt(value.permission.threshold)}`,
    ],
    ["Expires", expires],
  ]);
  const progress = value.thresholdReached
    ? `Progress  ${formatInt(value.currentWeight)} / ${formatInt(value.permission.threshold)} — threshold reached`
    : `Progress  ${formatInt(value.currentWeight)} / ${formatInt(value.permission.threshold)} — ${formatInt(value.missingWeight)} more weight needed`;
  const approved =
    value.approved.length === 0
      ? "No approved signers."
      : table(
          ["Approved signer", "Weight"],
          value.approved.map((signer) => [signer.address, formatInt(signer.weight)]),
        );
  const expired = value.expired
    ? "\n! Transaction expired; build a new transaction before collecting signatures."
    : "";
  return `Transaction\n${transaction
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}\n\n${progress}\n${approved}${expired}`;
}
