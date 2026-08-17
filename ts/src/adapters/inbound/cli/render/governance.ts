import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import { asObj, ok, pending, receipt, titled } from "./layout.js";
import { formatInt, formatSun } from "./scalars.js";

type Obj = Record<string, unknown>;

export const GovernanceFormatters = {
  proposalList: ((data) => renderProposalList(asObj(data))) satisfies TextFormatter,
  proposalShow: ((data) => renderProposalShow(asObj(data))) satisfies TextFormatter,
  governanceReceipt: ((data, ctx) =>
    renderGovernanceReceipt(asObj(data), ctx)) satisfies TextFormatter,
  contractCreate2: ((data) => {
    const d = asObj(data);
    return titled("Contract address (CREATE2)", [
      ["Deployer", String(d.deployerAddress ?? "")],
      ["Salt", `${String(d.salt ?? "")}  (${compactHex(String(d.saltHex ?? ""))})`],
      ["Code hash", String(d.codeHash ?? "")],
      ["Address", String(d.address ?? "")],
    ]);
  }) satisfies TextFormatter,
};

function renderProposalList(data: Obj): string {
  const proposals = Array.isArray(data.proposals) ? data.proposals.map(asObj) : [];
  const pagination = asObj(data.pagination);
  const total = Number(pagination.total ?? proposals.length);
  const paged = pagination.limit !== null || Number(pagination.offset ?? 0) > 0;
  const title = paged
    ? `Proposals (showing ${proposals.length} of ${total})`
    : `Proposals (${proposals.length})`;
  if (proposals.length === 0) return `${title}\n  (none)`;
  const headers = ["ID", "State", "Approvals", "Expiry (UTC)", "Parameter", "Value"];
  const align: Align[] = ["left", "left", "right", "left", "left", "right"];
  const rows: string[][] = [];
  for (const proposal of proposals) {
    const parameters = Array.isArray(proposal.parameters) ? proposal.parameters.map(asObj) : [];
    const base = [
      String(proposal.id ?? ""),
      String(proposal.state ?? ""),
      `${formatInt(proposal.approvals)} / ${formatInt(data.approvalThreshold)}`,
      utcMinute(proposal.expirationTime),
    ];
    if (parameters.length === 0) rows.push([...base, "", ""]);
    for (const [index, parameter] of parameters.entries()) {
      rows.push([
        ...(index === 0 ? base : ["", "", "", ""]),
        String(parameter.name ?? ""),
        changeValue(parameter.value),
      ]);
    }
  }
  return [title, ...table(headers, rows, align)].join("\n");
}

function renderProposalShow(data: Obj): string {
  const parameters = Array.isArray(data.parameters) ? data.parameters.map(asObj) : [];
  const body = titled(`Proposal #${String(data.id ?? "")}`, [
    ["State", String(data.state ?? "")],
    ["Proposer", String(data.proposerAddress ?? "")],
    ["Created time", `${utcMinute(data.createTime)} UTC`],
    ["Expiry time", `${utcMinute(data.expirationTime)} UTC`],
    ["Approvals", `${formatInt(data.approvals)} / ${formatInt(data.approvalThreshold)}`],
    ["Parameters", `(${parameters.length})`],
  ]);
  const nameWidth = width(parameters.map((parameter) => String(parameter.name ?? "")));
  const valueWidth = width(parameters.map((parameter) => changeValue(parameter.value)));
  return [
    body,
    ...parameters.map(
      (parameter) =>
        `    ${String(parameter.name ?? "").padEnd(nameWidth)}   ${changeValue(parameter.value).padStart(valueWidth)}` +
        (parameter.unit ? `   ${String(parameter.unit)}` : ""),
    ),
  ].join("\n");
}

function renderGovernanceReceipt(data: Obj, ctx: TextRenderContext): string {
  const kind = String(data.kind ?? "");
  const mode = String(data.mode ?? "");
  const label = actionLabel(kind, Boolean(data.addApproval));
  const fields = governanceRows(data, ctx);
  if (mode === "dry-run") {
    fields.push(["Fee", estimateFee(data)]);
    return appendChanges(receipt(pending(), `Dry run ${label}`, fields), data);
  }
  // Both early-exit modes exist to produce a relayable artifact, so the hex IS the output —
  // bare, as `tx send` prints it, so it pipes into a file or the next command unchanged. The
  // receipts below remain for the case the pipeline could not serialise one.
  if (mode === "build-only") {
    if (data.hex) return String(data.hex);
    return appendChanges(receipt(ok(), `Built unsigned ${label}`, fields), data);
  }
  if (mode === "sign-only") {
    if (data.hex) return String(data.hex);
    fields.push(["TxID", String(data.txId ?? "")]);
    fields.push(["Signed", signedSummary(data.signed)]);
    return appendChanges(receipt(ok(), `Signed ${label}`, fields), data);
  }

  fields.push(["TxID", String(data.txId ?? data.hash ?? "")]);
  const stage = String(data.stage ?? "submitted");
  if (stage === "confirmed" || stage === "failed") {
    fields.push(["Block", data.blockNumber === undefined ? "" : formatInt(data.blockNumber)]);
    fields.push(["Fee", confirmedFee(data)]);
    fields.push(["Status", stage === "failed" ? "failed" : "success"]);
    return appendChanges(
      receipt(stage === "failed" ? "❌" : ok(), pastLabel(kind, Boolean(data.addApproval)), fields),
      data,
    );
  }
  fields.push(["Status", "submitted — pending confirmation"]);
  return appendChanges(
    receipt(pending(), pastLabel(kind, Boolean(data.addApproval)), fields),
    data,
  );
}

function governanceRows(data: Obj, ctx: TextRenderContext): Array<[string, string]> {
  const address = (value: unknown) =>
    value ? `${String(value)}${ctx.accountLabel ? ` (${ctx.accountLabel})` : ""}` : "";
  switch (String(data.kind ?? "")) {
    case "proposal-create":
      return [
        ["Proposal", data.proposalId === undefined ? "" : `#${String(data.proposalId)}`],
        ["Proposer", address(data.proposerAddress)],
      ];
    case "proposal-approve":
      return [
        ["Proposal", `#${String(data.proposalId ?? "")}`],
        ["Voter", address(data.voterAddress)],
        ["Approvals", `${formatInt(data.approvals)} / ${formatInt(data.approvalThreshold)}`],
      ];
    case "proposal-delete":
      return [
        ["Proposal", `#${String(data.proposalId ?? "")}`],
        ["Proposer", address(data.proposerAddress)],
      ];
    case "witness-create":
    case "witness-update":
      return [
        ["Witness", address(data.witnessAddress)],
        ["Url", String(data.url ?? "")],
      ];
    case "witness-set-brokerage":
      return [
        ["Witness", address(data.witnessAddress)],
        ["Brokerage", `${String(data.brokerage ?? "")}%`],
      ];
    case "contract-clear-abi":
      return [
        ["Contract", String(data.contractAddress ?? "")],
        ["Deployer", address(data.deployerAddress)],
      ];
    case "contract-set-origin-energy-limit":
      return [
        ["Contract", String(data.contractAddress ?? "")],
        ["Deployer", address(data.deployerAddress)],
        ["Energy limit", formatInt(data.originEnergyLimit)],
      ];
    case "contract-set-user-resource-percent":
      return [
        ["Contract", String(data.contractAddress ?? "")],
        ["Deployer", address(data.deployerAddress)],
        ["User pays", `${String(data.consumeUserResourcePercent ?? "")}%`],
      ];
    default:
      return [];
  }
}

function appendChanges(rendered: string, data: Obj): string {
  const changes = Array.isArray(data.changes) ? data.changes.map(asObj) : [];
  if (changes.length === 0) return rendered;
  const nameWidth = width(changes.map((change) => String(change.name ?? "")));
  const fromWidth = width(changes.map((change) => changeValue(change.currentValue)));
  const toWidth = width(changes.map((change) => changeValue(change.proposedValue)));
  return [
    rendered,
    `  Parameter changes (${changes.length})`,
    ...changes.map(
      (change) =>
        `    ${String(change.name ?? "").padEnd(nameWidth)}   ${changeValue(change.currentValue).padStart(fromWidth)}` +
        ` → ${changeValue(change.proposedValue).padStart(toWidth)}` +
        (change.unit ? `   ${String(change.unit)}` : ""),
    ),
  ].join("\n");
}

function actionLabel(kind: string, addApproval: boolean): string {
  return (
    {
      "proposal-create": "proposal create",
      "proposal-approve": addApproval ? "proposal approval" : "approval cancellation",
      "proposal-delete": "proposal delete",
      "witness-create": "witness registration",
      "witness-update": "witness update",
      "witness-set-brokerage": "brokerage update",
      "contract-clear-abi": "ABI clear",
      "contract-set-origin-energy-limit": "origin energy limit update",
      "contract-set-user-resource-percent": "user resource ratio update",
    }[kind] ?? kind
  );
}

function pastLabel(kind: string, addApproval: boolean): string {
  return (
    {
      "proposal-create": "Proposal created",
      "proposal-approve": addApproval ? "Proposal approved" : "Approval canceled",
      "proposal-delete": "Proposal deleted",
      "witness-create": "Witness registered",
      "witness-update": "Witness updated",
      "witness-set-brokerage": "Brokerage set",
      "contract-clear-abi": "ABI cleared",
      "contract-set-origin-energy-limit": "Origin energy limit set",
      "contract-set-user-resource-percent": "User pay ratio set",
    }[kind] ?? kind
  );
}

function estimateFee(data: Obj): string {
  const fee = asObj(data.fee);
  if (fee.feeSun !== undefined) return `${formatSun(fee.feeSun)} TRX`;
  return String(fee.note ?? "bandwidth only");
}

function confirmedFee(data: Obj): string {
  const resource = asObj(data.resource);
  const bandwidth =
    resource.netUsage === undefined ? "" : `  (${formatInt(resource.netUsage)} bandwidth)`;
  const feeSun = data.feeSun ?? (data.kind === "witness-create" ? data.registrationFeeSun : 0);
  return `${formatSun(feeSun)} TRX${bandwidth}`;
}

function signedSummary(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  const signatures = (value as { signature?: unknown }).signature;
  return Array.isArray(signatures) ? signatures.map(String).join(", ") : JSON.stringify(value);
}

function changeValue(value: unknown): string {
  return value === null || value === undefined ? "unknown" : String(value);
}

type Align = "left" | "right";

function width(values: string[]): number {
  return Math.max(0, ...values.map((value) => value.length));
}

/** Column-aligned rows; numeric columns are right-aligned so digits line up down the page. */
function table(headers: string[], rows: string[][], align: Align[]): string[] {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length)),
  );
  const line = (cells: string[]) =>
    `  ${cells
      .map((cell, index) =>
        align[index] === "right"
          ? String(cell).padStart(widths[index] ?? 0)
          : String(cell).padEnd(widths[index] ?? 0),
      )
      .join("   ")
      .trimEnd()}`;
  return [line(headers), ...rows.map(line)];
}

function utcMinute(value: unknown): string {
  const epoch = Number(value);
  return Number.isFinite(epoch) && epoch > 0
    ? new Date(epoch).toISOString().replace("T", " ").slice(0, 16)
    : "unknown";
}

function compactHex(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
