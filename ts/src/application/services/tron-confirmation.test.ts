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
  return {
    getTransactionInfoById: async () => info ?? ({} as TronTxInfo),
  } as unknown as TronGateway;
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

/**
 * A TRON txID is the sha256 of the transaction body, so it is not a number the node assigns — it is
 * derivable from the bytes we signed, and we derive it. The broadcast reply carries the node's own
 * copy, and taking that one on trust means a node whose copy is wrong decides which transaction we
 * then poll for and report. Confirmed against a live Nile node: its txID matches ours exactly, so
 * this costs nothing when the node is honest and only bites when it is not.
 *
 * Preferring our own is the protection; the warning is disclosure. Getting only the warning right
 * would still leave --wait polling the wrong id and the receipt quoting it.
 */
describe("stageTronBroadcast reports the transaction id we signed", () => {
  const LOCAL = "defbf1e676a7b53c03a30ec3e17e455175231dcf6165ae2a762d2d973f81dbc9";
  const OTHER = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  it("uses the locally derived id when the node reports a different one, and says so", async () => {
    const s = scope({ wait: false });
    const staged = await stageTronBroadcast(gateway(undefined), s, { txId: OTHER }, LOCAL);

    expect(staged).toMatchObject({ stage: "submitted", txId: LOCAL });
    expect(s.warnings.join(" ")).toContain(OTHER);
  });

  it("stays silent when the node agrees, whatever case it uses", async () => {
    const s = scope({ wait: false });
    const staged = await stageTronBroadcast(
      gateway(undefined),
      s,
      { txId: LOCAL.toUpperCase() },
      LOCAL,
    );

    expect(staged).toMatchObject({ txId: LOCAL });
    expect(s.warnings).toEqual([]);
  });

  it("confirms against the locally derived id, not the one the node offered", async () => {
    const polled: string[] = [];
    const g = {
      getTransactionInfoById: async (id: string) => {
        polled.push(id);
        return { blockNumber: 9 } as TronTxInfo;
      },
    } as unknown as TronGateway;

    await stageTronBroadcast(g, scope(), { txId: OTHER }, LOCAL);

    expect(polled).toEqual([LOCAL]);
  });

  it("falls back to the node's id when the signed transaction carries none", async () => {
    const s = scope({ wait: false });
    expect(
      await stageTronBroadcast(gateway(undefined), s, { txId: OTHER }, undefined),
    ).toMatchObject({ txId: OTHER });
    expect(s.warnings).toEqual([]);
  });
});
