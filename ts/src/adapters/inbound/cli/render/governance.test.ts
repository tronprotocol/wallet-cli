import { describe, expect, it } from "vitest";
import { GovernanceFormatters } from "./governance.js";

const ctx = { accountLabel: "main" } as never;

const show = {
  id: 44,
  proposerAddress: "TSRee5xhbTccpvyDNyRRVAt5MJDLnYzcvS",
  state: "approved",
  createTime: 1_784_534_400_000,
  expirationTime: 1_784_620_800_000,
  approvals: 18,
  approvalThreshold: 18,
  parameters: [
    { id: 0, name: "getMaintenanceTimeInterval", value: 10_800_000, unit: "ms" },
    { id: 13, name: "getMaxCpuTimeOfOneTx", value: 80, unit: "ms" },
  ],
};

const list = {
  approvalThreshold: 18,
  pagination: { offset: 0, limit: null, total: 2 },
  proposals: [
    {
      id: 47,
      state: "voting",
      approvals: 12,
      expirationTime: 1_784_707_200_000,
      parameters: [{ id: 3, name: "getTransactionFee", value: 15, unit: "sun/byte" }],
    },
    {
      id: 44,
      state: "disapproved",
      approvals: 8,
      expirationTime: 1_784_620_800_000,
      parameters: show.parameters,
    },
  ],
};

describe("proposal text rendering", () => {
  it("never shows a current value — the proposal only records what it would set", () => {
    for (const rendered of [
      GovernanceFormatters.proposalShow(show),
      GovernanceFormatters.proposalList(list),
    ]) {
      expect(rendered).not.toContain("→");
      expect(rendered).not.toContain("unknown");
    }
    expect(JSON.stringify([show, list])).not.toContain("currentValue");
  });

  it("right-aligns values and keeps multi-parameter proposals on continuation rows", () => {
    expect(GovernanceFormatters.proposalShow(show)).toContain(
      [
        "  Parameters    (2)",
        "    getMaintenanceTimeInterval   10800000   ms",
        "    getMaxCpuTimeOfOneTx               80   ms",
      ].join("\n"),
    );

    const rows = GovernanceFormatters.proposalList(list).split("\n");
    expect(rows[1]).toContain("Parameter");
    expect(rows[1]?.trimEnd().endsWith("Value")).toBe(true);
    // second parameter of #44 continues below it with the left-hand columns blank
    expect(rows[4]?.trimStart().startsWith("getMaxCpuTimeOfOneTx")).toBe(true);
    expect(rows[4]?.trimEnd().endsWith("80")).toBe(true);
  });

  it("marks an empty list (none) rather than leaving a bare header", () => {
    const empty = GovernanceFormatters.proposalList({
      approvalThreshold: 18,
      proposals: [],
      pagination: { offset: 0, limit: null, total: 0 },
    });
    expect(empty).toBe("Proposals (0)\n  (none)");
  });

  it("keeps the before/after arrow on a create receipt, where the baseline is what was just read", () => {
    const receipt = GovernanceFormatters.governanceReceipt(
      {
        kind: "proposal-create",
        stage: "confirmed",
        txId: "9c4",
        blockNumber: 57_880_102,
        proposalId: 48,
        proposerAddress: "TSRee5xhbTccpvyDNyRRVAt5MJDLnYzcvS",
        changes: [
          {
            id: 2,
            name: "getCreateAccountFee",
            currentValue: 100_000,
            proposedValue: 200_000,
            unit: "sun",
          },
          {
            id: 3,
            name: "getTransactionFee",
            currentValue: 10,
            proposedValue: 15,
            unit: "sun/byte",
          },
        ],
      },
      ctx,
    );
    expect(receipt).toContain(
      [
        "  Parameter changes (2)",
        "    getCreateAccountFee   100000 → 200000   sun",
        "    getTransactionFee         10 →     15   sun/byte",
      ].join("\n"),
    );
  });
});

/**
 * `--build-only` and `--sign-only` exist to hand the transaction hex to the next step (collect a
 * co-signature, relay it offline). `tx send` prints that hex bare, so it pipes straight into a file
 * or another command; the governance renderer printed a receipt built around `data.unsignedHex`, a
 * field the pipeline never produces — the canonical name is `hex`. `kv()` drops empty rows, so the
 * artifact did not merely render blank, it vanished, and only `-o json` carried it.
 */
describe("governance build-only / sign-only emit the transaction artifact", () => {
  const HEX = "0a83010a02c1112208bd2a9a677fccd7dc";

  it.each([
    ["build-only", { kind: "witness-update", mode: "build-only", hex: HEX }],
    ["sign-only", { kind: "witness-update", mode: "sign-only", hex: HEX, txId: "abc", signed: {} }],
  ])("`%s` prints the hex and nothing else, exactly like `tx send`", (_label, data) => {
    expect(GovernanceFormatters.governanceReceipt(data, ctx)).toBe(HEX);
  });
});
