import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";

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
    ["unfreeze_amount", "unfreezeAmount", "899999999999999999"],
    ["withdraw_amount", "withdrawnSun", "9007199254740993"],
    ["exchange_received_amount", "exchangeReceived", "900000000000000001"],
    ["exchange_inject_another_amount", "exchangeInjectedOther", "900000000000000003"],
    ["exchange_withdraw_another_amount", "exchangeWithdrawnOther", "900000000000000005"],
  ] as const)("%s", async (field, normalized, exact) => {
    const calls = nodeReturns(`{"blockNumber": 1, "${field}": ${exact}}`);
    const info = await client().getTransactionInfoById("abc");

    expect(info[normalized]).toBe(exact);
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

    expect(info).toMatchObject({
      feeSun: 1_100_000,
      blockNumber: 12,
      energyUsed: 31_895,
      netUsed: 345,
      receiptResult: "SUCCESS",
      execution: "success",
    });
  });

  it("rejects a fee beyond 2^53 instead of rounding it", async () => {
    nodeReturns(`{"blockNumber": 12, "fee": 9007199254740993}`);
    await expect(client().getTransactionInfoById("abc")).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  it("still reports a pending transaction as having no block", async () => {
    nodeReturns("{}");
    expect((await client().getTransactionInfoById("abc")).blockNumber).toBeUndefined();
  });
});

describe("transaction-info polling honours the caller's signal", () => {
  it("does not send the request once the signal has aborted", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        init.signal?.throwIfAborted();
        sent.push(init.body);
        return { ok: true, status: 200, text: async () => "{}" } as never;
      }),
    );

    await expect(client().getTransactionInfoById("abc", AbortSignal.abort())).rejects.toMatchObject(
      { code: "timeout" },
    );
    expect(sent).toEqual([]);
  });
});
