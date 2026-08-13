import type { AccountPermissionsView, PermissionGroupView } from "../../../../domain/types/index.js";
import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import { formatInt, formatSun } from "./scalars.js";
import { fail, ok, pending, receipt, type Pair } from "./layout.js";

function operationLines(labels: string[]): string[] {
  const lines: string[] = [];
  let current = "";
  for (const label of labels) {
    const next = current ? `${current} · ${label}` : label;
    if (next.length > 76 && current) {
      lines.push(current);
      current = label;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function permissionCard(permission: PermissionGroupView, active = false): string {
  const activePermission = active ? permission as AccountPermissionsView["actives"][number] : undefined;
  const lines = [
    `Permission Name   ${permission.name}  (id ${permission.id}${active ? ", active" : ""})`,
  ];
  if (activePermission) {
    const operations = [
      ...activePermission.operationLabels,
      ...activePermission.unknownOperationIds.map((id) => `Unknown contract type ${id}`),
    ];
    const wrapped = operationLines(operations);
    lines.push(`Operation(s)      ${wrapped[0] ?? ""}`);
    for (const continuation of wrapped.slice(1)) lines.push(`                  ${continuation}`);
    lines[lines.length - 1] += `  (${operations.length} total)`;
    lines.push(`Operations Hex    ${activePermission.operationsHex}`);
  }
  lines.push(`Threshold         ${formatInt(permission.threshold)}`);
  lines.push("Authorized To     Address                             Weight");
  for (const key of permission.keys) {
    lines.push(`                  ${key.address}  ${String(key.weight).padStart(6)}${key.local ? `  (this wallet: ${key.local})` : ""}`);
  }
  return lines.join("\n");
}

function renderPermissions(value: AccountPermissionsView, ctx?: TextRenderContext): string {
  const account = ctx?.accountLabel ? `${ctx.accountLabel} (${value.address})` : value.address;
  return [
    `Account  ${account}`,
    "",
    permissionCard(value.owner),
    ...(value.witness ? ["", permissionCard(value.witness)] : []),
    ...value.actives.flatMap((permission) => ["", permissionCard(permission, true)]),
  ].join("\n");
}

function updateReceipt(value: any): string {
  if ((value.mode === "build-only" || value.mode === "sign-only") && value.hex) return String(value.hex);
  const pairs: Pair[] = [];
  if (value.txId) pairs.push(["TxID", String(value.txId)]);
  if (value.blockNumber !== undefined) pairs.push(["Block", `#${formatInt(value.blockNumber)}`]);
  const feeSun = value.feeSun ?? value.fee?.feeSun;
  if (feeSun !== undefined) pairs.push(["Fee", `${formatSun(feeSun)} TRX`]);
  if (value.mode === "dry-run") pairs.push(["Status", "not submitted"]);
  else if (value.stage === "submitted") pairs.push(["Status", "pending — not yet on-chain"]);
  else if (value.stage === "failed") pairs.push(["Status", String(value.result ?? "failed")]);
  else if (value.stage === "confirmed") pairs.push(["Status", "success"]);
  const header = value.mode === "dry-run"
    ? receipt(pending(), "Permission update dry run", pairs)
    : value.stage === "failed"
      ? receipt(fail(), "Permission update failed", pairs)
      : value.stage === "confirmed"
        ? receipt(ok(), "Permissions updated", pairs)
        : receipt(pending(), "Permission update submitted", pairs);
  return value.permissions ? `${header}\n\n${renderPermissions(value.permissions)}` : header;
}

export const PermissionFormatters = {
  permissionShow: ((value, ctx) => renderPermissions(value, ctx)) satisfies TextFormatter<AccountPermissionsView>,
  permissionUpdate: ((value) => updateReceipt(value)) satisfies TextFormatter,
};
