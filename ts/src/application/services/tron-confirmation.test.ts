import { describe, it, expect } from "vitest";
import { stageTronBroadcast, tronConfirmation } from "./tron-confirmation.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { TronGateway } from "../ports/chain/tron-gateway.js";
import type { TronTransactionArtifact } from "../../domain/types/index.js";
import { parseTronTxInfo } from "../../adapters/outbound/chain/tron/tron-responses.js";

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

// Node JSON goes through the adapter's parser, so tests see the facts the adapter derives.
function gateway(info: object | undefined): TronGateway {
  return {
    getTransactionInfoById: async () => parseTronTxInfo(info ?? {}),
  } as unknown as TronGateway;
}

function transaction(type: string, txID = "abc"): TronTransactionArtifact {
  return { txID, raw_data: { contract: [{ type }] }, raw_data_hex: "" };
}

const NATIVE = transaction("TransferContract");
const CONTRACT_CALL = transaction("TriggerSmartContract");

describe("stageTronBroadcast (issue #7 — --wait fallback is not silent)", () => {
  it("confirmed: no warning, stage=confirmed", async () => {
    const s = scope();
    const out = await stageTronBroadcast(
      gateway({ blockNumber: 42, receipt: { result: "SUCCESS" } }),
      s,
      { txId: "abc" },
      NATIVE,
    );
    expect(out.stage).toBe("confirmed");
    expect(s.warnings).toEqual([]);
  });

  it("wait requested but never confirms within the window → submitted + a warning", async () => {
    const s = scope({ waitTimeoutMs: 0 });
    const out = await stageTronBroadcast(gateway(undefined), s, { txId: "abc" }, NATIVE);
    expect(out.stage).toBe("submitted");
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toContain("not confirmed");
    expect(s.warnings[0]).toContain("abc");
  });

  it("wait requested but broadcast returned no txid → submitted + a warning", async () => {
    const s = scope();
    const out = await stageTronBroadcast(
      gateway(undefined),
      s,
      {},
      transaction("TransferContract", ""),
    );
    expect(out.stage).toBe("submitted");
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toContain("no txid");
  });

  it("no --wait → submitted, no warning (silence is correct here)", async () => {
    const s = scope({ wait: false });
    const out = await stageTronBroadcast(gateway(undefined), s, { txId: "abc" }, NATIVE);
    expect(out.stage).toBe("submitted");
    expect(s.warnings).toEqual([]);
  });
});

describe("stageTronBroadcast reports the transaction id we signed", () => {
  const LOCAL = "defbf1e676a7b53c03a30ec3e17e455175231dcf6165ae2a762d2d973f81dbc9";
  const OTHER = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  it("uses the locally derived id when the node reports a different one, and says so", async () => {
    const s = scope({ wait: false });
    const staged = await stageTronBroadcast(
      gateway(undefined),
      s,
      { txId: OTHER },
      transaction("TransferContract", LOCAL),
    );

    expect(staged).toMatchObject({ stage: "submitted", txId: LOCAL });
    expect(s.warnings.join(" ")).toContain(OTHER);
  });

  it("stays silent when the node agrees, whatever case it uses", async () => {
    const s = scope({ wait: false });
    const staged = await stageTronBroadcast(
      gateway(undefined),
      s,
      { txId: LOCAL.toUpperCase() },
      transaction("TransferContract", LOCAL),
    );

    expect(staged).toMatchObject({ txId: LOCAL });
    expect(s.warnings).toEqual([]);
  });

  it("confirms against the locally derived id, not the one the node offered", async () => {
    const polled: string[] = [];
    const g = {
      getTransactionInfoById: async (id: string) => {
        polled.push(id);
        return parseTronTxInfo({ blockNumber: 9 });
      },
    } as unknown as TronGateway;

    await stageTronBroadcast(g, scope(), { txId: OTHER }, transaction("TransferContract", LOCAL));

    expect(polled).toEqual([LOCAL]);
  });

  it("falls back to the node's id when the signed transaction carries none", async () => {
    const s = scope({ wait: false });
    expect(
      await stageTronBroadcast(
        gateway(undefined),
        s,
        { txId: OTHER },
        transaction("TransferContract", ""),
      ),
    ).toMatchObject({ txId: OTHER });
    expect(s.warnings).toEqual([]);
  });
});

describe("tronConfirmation distinguishes mined from succeeded", () => {
  it("top-level result FAILED with no nested receipt result → failed", async () => {
    const s = scope();
    const out = await stageTronBroadcast(
      gateway({ blockNumber: 42, result: "FAILED", receipt: {} }),
      s,
      { txId: "abc" },
      NATIVE,
    );
    expect(out.stage).toBe("failed");
  });

  it("nested receipt result other than SUCCESS/DEFAULT → failed even when the top level is silent", async () => {
    const s = scope();
    const out = await stageTronBroadcast(
      gateway({ blockNumber: 42, receipt: { result: "17" } }),
      s,
      { txId: "abc" },
      NATIVE,
    );
    expect(out.stage).toBe("failed");
  });

  it("a receipt result DEFAULT is no execution result, not a failure", async () => {
    const out = await stageTronBroadcast(
      gateway({ blockNumber: 42, receipt: { result: "DEFAULT" } }),
      scope(),
      { txId: "abc" },
      NATIVE,
    );
    expect(out).toMatchObject({ stage: "confirmed", failed: false });
  });

  it("a native transaction may legitimately omit receipt.result and still confirms", async () => {
    const s = scope();
    const out = await stageTronBroadcast(
      gateway({ blockNumber: 42, receipt: {} }),
      s,
      { txId: "abc" },
      NATIVE,
    );
    expect(out.stage).toBe("confirmed");
  });
});

describe("tronConfirmation requires an execution result for contract execution", () => {
  for (const type of ["TriggerSmartContract", "CreateSmartContract"]) {
    it(`${type} mined without a result is not confirmed`, async () => {
      const confirm = tronConfirmation(
        gateway({ blockNumber: 42, receipt: {} }),
        scope({ waitTimeoutMs: 0 }),
      );
      expect(await confirm("abc", transaction(type))).toBeUndefined();
    });
  }

  it("a contract call confirms once its result is known", async () => {
    const confirm = tronConfirmation(
      gateway({ blockNumber: 42, receipt: { result: "REVERT" } }),
      scope({ waitTimeoutMs: 0 }),
    );
    expect(await confirm("abc", CONTRACT_CALL)).toMatchObject({ failed: true, result: "REVERT" });
  });

  it("tx broadcast of a contract call stays submitted while its result is unknown", async () => {
    const s = scope({ waitTimeoutMs: 0 });
    const out = await stageTronBroadcast(
      gateway({ blockNumber: 42, receipt: {} }),
      s,
      { txId: "abc" },
      CONTRACT_CALL,
    );
    expect(out.stage).toBe("submitted");
    expect(s.warnings[0]).toContain("not confirmed");
  });
});
