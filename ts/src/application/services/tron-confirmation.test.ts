import { describe, it, expect } from "vitest";
import { stageTronBroadcast } from "./tron-confirmation.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { TronGateway, TronTxInfo } from "../ports/chain/tron-gateway.js";

// Issue #7: a --wait confirmation that never lands must not silently degrade to "submitted" as if
// the user never asked to wait — it has to leave a trace in scope.warn (→ meta.warnings + stderr).

function scope(over: Partial<TransactionScope> = {}): TransactionScope & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    wait: true,
    waitTimeoutMs: 10,
    timeoutMs: 1000,
    activeAccount: {} as never,
    resolveAddress: () => "T",
    emit: () => {},
    warn: (m: string) => warnings.push(m),
    ...over,
  };
}

function gateway(info: TronTxInfo | undefined): TronGateway {
  return { getTransactionInfoById: async () => info ?? ({} as TronTxInfo) } as unknown as TronGateway;
}

describe("stageTronBroadcast (issue #7 — --wait fallback is not silent)", () => {
  it("confirmed: no warning, stage=confirmed", async () => {
    const s = scope();
    const out = await stageTronBroadcast(
      gateway({ blockNumber: 42, receipt: { result: "SUCCESS" } }),
      s,
      { txId: "abc" },
    );
    expect(out.stage).toBe("confirmed");
    expect(s.warnings).toEqual([]);
  });

  it("wait requested but never confirms within the window → submitted + a warning", async () => {
    const s = scope({ waitTimeoutMs: 0 }); // deadline already passed → one poll, then give up
    const out = await stageTronBroadcast(gateway(undefined), s, { txId: "abc" });
    expect(out.stage).toBe("submitted");
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toContain("not confirmed");
    expect(s.warnings[0]).toContain("abc");
  });

  it("wait requested but broadcast returned no txid → submitted + a warning", async () => {
    const s = scope();
    const out = await stageTronBroadcast(gateway(undefined), s, {});
    expect(out.stage).toBe("submitted");
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toContain("no txid");
  });

  it("no --wait → submitted, no warning (silence is correct here)", async () => {
    const s = scope({ wait: false });
    const out = await stageTronBroadcast(gateway(undefined), s, { txId: "abc" });
    expect(out.stage).toBe("submitted");
    expect(s.warnings).toEqual([]);
  });
});
