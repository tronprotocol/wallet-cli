import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";

/**
 * The TRC10 and exchange reads were the last endpoints still going through tronweb, whose HTTP
 * provider parses with a plain `JSON.parse` — so a protocol int64 was already a rounded float64 by
 * the time it reached this class, and no amount of `String(...)` downstream could recover it.
 *
 * These tests pin the whole read: the request the node receives, and the exactness of what comes
 * back. `fetch` is stubbed rather than a live node dialled, so the byte-level JSON (which is the
 * entire point) is under the test's control.
 */
const OWNER_HEX = "418225f3aa48a2d30643a64410abb1e914dfa0bd2f";
const OWNER = "TMqNJwD3qVmuRxzzP3Q4A24fuByVBKQ39E";

function nodeReturns(body: string) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => body } as never;
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const client = () => new TronRpcClient("https://node.invalid", 1000);

const ASSET = `{
  "id": "1002438",
  "owner_address": "${OWNER_HEX}",
  "name": "4556494c",
  "total_supply": 666666666666666666,
  "trx_num": 1000000,
  "num": 666,
  "precision": 6,
  "start_time": 1558134600062,
  "end_time": 1589755860062,
  "frozen_supply": [{ "frozen_amount": 899999999999999999, "frozen_days": 30 }]
}`;

describe("TRC10 reads carry int64 quantities exactly", () => {
  it("getAssetById returns the supply the node actually sent", async () => {
    const calls = nodeReturns(ASSET);
    const asset = await client().getAssetById("1002438");

    expect(asset?.total_supply).toBe("666666666666666666");
    expect(asset?.frozen_supply?.[0]?.frozen_amount).toBe("899999999999999999");
    expect(asset?.name).toBe("EVIL");
    expect(calls[0]!.url).toContain("/wallet/getassetissuebyid");
    expect(calls[0]!.body).toMatchObject({ value: "1002438" });
  });

  it("getAssetByIssuer returns the supply the node actually sent", async () => {
    nodeReturns(`{"assetIssue": [${ASSET}]}`);
    const asset = await client().getAssetByIssuer(OWNER);
    expect(asset?.total_supply).toBe("666666666666666666");
  });

  it("getAssetsByName returns every match with exact supplies", async () => {
    nodeReturns(`{"assetIssue": [${ASSET}, ${ASSET}]}`);
    const assets = await client().getAssetsByName("EVIL");

    expect(assets).toHaveLength(2);
    expect(assets[0]!.total_supply).toBe("666666666666666666");
  });

  it("listAssets returns a page with exact supplies", async () => {
    const calls = nodeReturns(`{"assetIssue": [${ASSET}]}`);
    const assets = await client().listAssets(10, 20);

    expect(assets[0]!.total_supply).toBe("666666666666666666");
    expect(calls[0]!.body).toMatchObject({ limit: 10, offset: 20 });
  });

  // An unknown id is an empty answer, not a fault: the caller maps absence to asset_not_found.
  it("reports an unknown id as absent rather than inventing an asset", async () => {
    nodeReturns("{}");
    expect(await client().getAssetById("999")).toBeUndefined();
  });

  it("reports no match for a name as an empty list", async () => {
    nodeReturns("{}");
    expect(await client().getAssetsByName("nope")).toEqual([]);
  });
});

describe("exchange reads carry int64 reserves exactly", () => {
  // Reserves are not merely displayed: they drive proportionalOther/bancorOutput, whose results are
  // the quantities signed into inject/withdraw/trade.
  const PAIR = `{
    "exchange_id": 12,
    "creator_address": "${OWNER_HEX}",
    "create_time": 1558134600062,
    "first_token_id": "5f",
    "first_token_balance": 9007199254740993,
    "second_token_id": "31303035303338",
    "second_token_balance": 900000000000000001
  }`;

  it("getExchangeById keeps both reserves exact", async () => {
    const calls = nodeReturns(PAIR);
    const pair = await client().getExchangeById(12);

    expect(pair?.firstTokenBalance).toBe("9007199254740993");
    expect(pair?.secondTokenBalance).toBe("900000000000000001");
    expect(pair?.firstTokenId).toBe("_");
    expect(pair?.secondTokenId).toBe("1005038");
    expect(calls[0]!.body).toMatchObject({ id: 12 });
  });

  it("listExchanges keeps reserves exact", async () => {
    nodeReturns(`{"exchanges": [${PAIR}]}`);
    const pairs = await client().listExchanges(10, 0);
    expect(pairs[0]!.secondTokenBalance).toBe("900000000000000001");
  });

  it("reports an unknown pair as absent", async () => {
    nodeReturns("{}");
    expect(await client().getExchangeById(999)).toBeUndefined();
  });
});
