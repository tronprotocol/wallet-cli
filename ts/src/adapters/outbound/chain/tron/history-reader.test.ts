import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../../application/services/command-deadline.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TronGridHistoryReader } from "./history-reader.js";
import { expiringCheck } from "../../http/__test-support__/dispatch.js";
import { ERROR_CODES } from "../../../../domain/errors/codes.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const network = { httpEndpoint: "http://localhost:1" } as NetworkDescriptor;

afterEach(() => vi.unstubAllGlobals());

function nodeAnswers(status: number, body = "{}") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

const read = (check = NO_CHECK) =>
  new TronGridHistoryReader().get(network, "TXaddr", { limit: 20 }, check);

describe("TronGridHistoryReader failures", () => {
  it.each([
    [503, "rpc_error", "same"],
    [500, "rpc_error", "same"],
    [429, "provider_rate_limited", "later"],
    [404, "history_not_supported", "never"],
  ] as const)("HTTP %i → %s", async (status, code, retry) => {
    nodeAnswers(status);
    await expect(read()).rejects.toMatchObject({ code });
    expect(ERROR_CODES[code].retry).toBe(retry);
  });

  it("reports a timeout as timeout", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "TimeoutError")),
          );
        }),
    );
    await expect(read(expiringCheck(20))).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports a network failure as rpc_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(read()).rejects.toMatchObject({ code: "rpc_error" });
  });

  it.each(["not json", "null", '{"data": {}}', '{"success": true}', '{"data": null}'])(
    "reports a malformed body %j as invalid_node_response",
    async (body) => {
      nodeAnswers(200, body);
      await expect(read()).rejects.toMatchObject({ code: "invalid_node_response" });
    },
  );

  it("reports a network without an endpoint as history_not_supported", async () => {
    await expect(
      new TronGridHistoryReader().get({} as NetworkDescriptor, "TXaddr", { limit: 20 }, NO_CHECK),
    ).rejects.toMatchObject({ code: "history_not_supported" });
  });

  it("reads an empty page", async () => {
    nodeAnswers(200, '{"data": []}');
    await expect(read()).resolves.toMatchObject({ count: 0, records: [] });
  });
});

describe("TronGridHistoryReader TRC10 transfers", () => {
  const OWNER = "TEPk9tW9ngsUv7jdQrDr8kh3GNVHm1X6Kd";
  const OWNER_HEX = "41303b40e232f4394f7715db3b133155a628a0b689";
  const TO_HEX = "419783744f5a16e0597cf421335550bf1fd903cd03";
  const page = (asset_name: string) =>
    JSON.stringify({
      data: [
        {
          txID: "aa".repeat(32),
          block_timestamp: 1,
          ret: [{ contractRet: "SUCCESS" }],
          raw_data: {
            contract: [
              {
                type: "TransferAssetContract",
                parameter: {
                  value: {
                    amount: 1000000,
                    asset_name,
                    owner_address: OWNER_HEX,
                    to_address: TO_HEX,
                  },
                },
              },
            ],
          },
        },
        {
          txID: "bb".repeat(32),
          block_timestamp: 2,
          ret: [{ contractRet: "SUCCESS" }],
          raw_data: {
            contract: [
              {
                type: "TransferContract",
                parameter: {
                  value: { amount: 2000000, owner_address: OWNER_HEX, to_address: TO_HEX },
                },
              },
            ],
          },
        },
      ],
    });

  function answers(history: string, asset: (body: string) => Response) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        calls.push(path);
        if (path === "/wallet/getassetissuebyid") return asset(String(init?.body));
        return new Response(history, { status: 200 });
      }),
    );
    return calls;
  }

  const readOwner = (only?: "native") =>
    new TronGridHistoryReader().get(
      network,
      OWNER,
      { limit: 20, ...(only ? { only } : {}) },
      NO_CHECK,
    );

  it.each([undefined, "native"] as const)(
    "reports the asset and its units, never TRX (only=%s)",
    async (only) => {
      const calls = answers(page("1007445"), () =>
        Response.json({
          id: "1007445",
          name: "tenergy.dev",
          abbr: "TEN",
          precision: 6,
          trx_num: 1,
          num: 1,
        }),
      );
      const result = await readOwner(only);
      expect(result.records[0]).toMatchObject({
        type: "TransferAsset",
        amount: "1",
        rawAmount: "1000000",
        symbol: "TEN",
        assetId: "1007445",
      });
      expect(result.records[1]).toMatchObject({ type: "Transfer", amount: "2", symbol: "TRX" });
      expect(calls.filter((path) => path === "/wallet/getassetissuebyid")).toHaveLength(1);
    },
  );

  it("keeps the raw amount and no symbol when the asset metadata cannot be read", async () => {
    answers(page("1007445"), () => new Response("down", { status: 500 }));
    const record = (await readOwner()).records[0]!;
    expect(record).toMatchObject({ amount: "", rawAmount: "1000000", assetId: "1007445" });
    expect(record.symbol).toBeUndefined();
  });

  it("fails timeout when the command deadline ends an asset lookup that was sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL, init?: RequestInit) => {
        if (new URL(String(url)).pathname !== "/wallet/getassetissuebyid") {
          return Promise.resolve(new Response(page("1007445"), { status: 200 }));
        }
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "TimeoutError")),
          );
        });
      }),
    );
    const pending = new TronGridHistoryReader().get(
      network,
      OWNER,
      { limit: 20 },
      expiringCheck(30),
    );
    await expect(pending).rejects.toMatchObject({ code: "timeout" });
  });

  it("names a pre-id asset by its name without a lookup", async () => {
    const calls = answers(page("Star"), () => Response.json({}));
    const record = (await readOwner()).records[0]!;
    expect(record).toMatchObject({ amount: "", rawAmount: "1000000", symbol: "Star" });
    expect(record).not.toHaveProperty("assetId");
    expect(calls).not.toContain("/wallet/getassetissuebyid");
  });
});
