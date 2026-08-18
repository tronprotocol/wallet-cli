import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";

/**
 * `--wait` receipts report what the chain actually did. The realised quantities among them are
 * protocol int64 and, on a high-supply TRC10, genuinely large: the amount released by
 * `asset unfreeze` or returned by an `exchange trade` can exceed 2^53 even though a fee never
 * will. They reached us through tronweb's plain `JSON.parse`, so those were rounded before any
 * downstream `String(...)` could preserve them.
 *
 * Fees and resource counters deliberately stay numbers: 2^53 sun is nine billion TRX, so widening
 * them would change the machine contract of every `--wait` receipt to buy nothing.
 */
function nodeReturns(body: string) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, text: async () => body } as never;
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const client = () => new TronRpcClient("https://node.invalid", 1000);

describe("transaction-info realised amounts survive as exact decimal strings", () => {
  it.each([
    ["unfreeze_amount", "899999999999999999"],
    ["withdraw_amount", "9007199254740993"],
    ["exchange_received_amount", "900000000000000001"],
    ["exchange_inject_another_amount", "900000000000000003"],
    ["exchange_withdraw_another_amount", "900000000000000005"],
  ])("%s", async (field, exact) => {
    const calls = nodeReturns(`{"blockNumber": 1, "${field}": ${exact}}`);
    const info = await client().getTransactionInfoById("abc");

    expect(String((info as Record<string, unknown>)[field])).toBe(exact);
    expect(calls[0]!.url).toContain("/wallet/gettransactioninfobyid");
    expect(calls[0]!.body).toMatchObject({ value: "abc" });
  });

  it("leaves fee and resource counters as numbers — the machine contract is unchanged", async () => {
    nodeReturns(`{
      "blockNumber": 12,
      "fee": 1100000,
      "receipt": { "result": "SUCCESS", "energy_usage_total": 31895, "net_usage": 345, "energy_fee": 0, "net_fee": 0 }
    }`);
    const info = await client().getTransactionInfoById("abc");

    expect(info.fee).toBe(1_100_000);
    expect(info.blockNumber).toBe(12);
    expect(info.receipt?.energy_usage_total).toBe(31_895);
    expect(info.receipt?.net_usage).toBe(345);
    expect(info.receipt?.result).toBe("SUCCESS");
  });

  it("still reports a pending transaction as having no block", async () => {
    nodeReturns("{}");
    expect((await client().getTransactionInfoById("abc")).blockNumber).toBeUndefined();
  });
});
