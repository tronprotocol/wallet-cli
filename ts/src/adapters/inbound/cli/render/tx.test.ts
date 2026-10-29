import { describe, expect, it } from "vitest";
import { TxFormatters } from "./tx.js";
import type { TxReceiptView } from "../../../../domain/types/index.js";

const ctx = { net: { id: "tron:3448148188", family: "tron", nativeSymbol: "TRX" } } as never;
const render = (receipt: TxReceiptView) => TxFormatters.txReceipt(receipt, ctx);

describe("receipt timing guidance comes from the result", () => {
  it.each([
    ["submitted", "pending"],
    ["confirmed", "success"],
  ] as const)("vote-cast %s", (stage, status) => {
    const base = { kind: "vote-cast" as const, stage, txId: "tx", votes: [] };
    expect(render({ ...base, maintenanceIntervalMs: 6 * 3_600_000 })).toContain(
      `${status} — tallied at next maintenance cycle (~6h)`,
    );
    expect(render({ ...base, maintenanceIntervalMs: 2 * 3_600_000 })).toContain("(~2h)");
  });

  it.each([
    ["submitted", "pending"],
    ["confirmed", "success"],
  ] as const)("reward-withdraw %s", (stage, status) => {
    const base = { kind: "reward-withdraw", stage, txId: "tx" } as const;
    expect(render({ ...base, withdrawIntervalMs: 24 * 3_600_000 })).toContain(
      `${status} — next withdrawal available in ~24h`,
    );
    expect(render({ ...base, withdrawIntervalMs: 12 * 3_600_000 })).toContain("in ~12h");
  });
});
