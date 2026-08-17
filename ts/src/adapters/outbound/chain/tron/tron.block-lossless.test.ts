import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TronRpcClient.getBlock", () => {
  it("preserves node integers above Number.MAX_SAFE_INTEGER as exact strings", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          `{
        "blockID": "abc",
        "transactions": [{
          "raw_data": {
            "timestamp": 1785393457166367900
          }
        }]
      }`,
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);

    const client = new TronRpcClient("https://node.invalid", 100);
    client.tronweb.trx.getBlockByNumber = vi.fn(async () => ({
      blockID: "abc",
      transactions: [
        {
          raw_data: {
            timestamp: 1785393457166368000,
          },
        },
      ],
    })) as never;

    const block = (await client.getBlock("69628067")) as {
      transactions: Array<{ raw_data: { timestamp: unknown } }>;
    };

    expect(block.transactions[0]!.raw_data.timestamp).toBe("1785393457166367900");
    expect(fetch).toHaveBeenCalledWith(
      "https://node.invalid/wallet/getblockbynum",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ num: 69628067 }),
      }),
    );
  });
});
