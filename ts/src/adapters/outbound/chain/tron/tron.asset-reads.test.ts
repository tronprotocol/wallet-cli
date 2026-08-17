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

/**
 * A response is only trustworthy to the extent it can be checked. Two things can be:
 *
 *   - identity — we know which id we asked for, so a record answering with a different one is a
 *     mismatch no matter how self-consistent it looks;
 *   - protocol range — precision is 0..6 and the rate pair is a positive int32, by definition of
 *     the contract, not by observation.
 *
 * Both matter because these fields are not merely displayed: `precision` converts a human `--amount`
 * into the minimal units that get SIGNED, so a node that reports 0 where the token has 6 moves the
 * decimal point six places on a transaction the user is about to authorise.
 *
 * Scanning every TRC10 on mainnet (5,192) and Nile (4,000) found zero records violating either
 * rule, so rejecting is not a compatibility risk — an out-of-range value is a broken or dishonest
 * node, never a historical quirk. Absence stays legal: 47.67% of mainnet assets omit `precision`
 * entirely, which means 0.
 */
describe("node responses are checked against what we asked for and what the protocol allows", () => {
  const asset = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "1002438",
      owner_address: OWNER_HEX,
      name: "4556494c",
      total_supply: 100,
      trx_num: 1,
      num: 1,
      precision: 6,
      start_time: 1,
      end_time: 2,
      ...over,
    });

  it("rejects an asset whose id is not the one requested", async () => {
    nodeReturns(asset({ id: "9999" }));
    await expect(client().getAssetById("1002438")).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  it.each([
    ["far out of range", 100_000],
    ["negative", -1],
    ["fractional", 1.5],
    ["one past the ceiling", 7],
  ])("rejects a precision that is %s", async (_label, precision) => {
    nodeReturns(asset({ precision }));
    await expect(client().getAssetById("1002438")).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  it.each([
    ["trx_num", { trx_num: 0 }],
    ["num", { num: 0 }],
    ["a negative rate", { trx_num: -1 }],
  ])("rejects a rate pair that is not a positive int32: %s", async (_label, over) => {
    nodeReturns(asset(over));
    await expect(client().getAssetById("1002438")).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  it("accepts an asset with no precision field at all — that is 47% of mainnet", async () => {
    nodeReturns(asset({ precision: undefined }));
    await expect(client().getAssetById("1002438")).resolves.toMatchObject({ id: "1002438" });
  });

  it("accepts every precision the protocol allows", async () => {
    for (const precision of [0, 1, 2, 3, 4, 5, 6]) {
      nodeReturns(asset({ precision }));
      await expect(client().getAssetById("1002438")).resolves.toMatchObject({ precision });
    }
  });

  it("rejects an exchange whose id is not the one requested", async () => {
    nodeReturns(
      '{"exchange_id": 99, "creator_address": "' +
        OWNER_HEX +
        '", "first_token_id": "5f", "first_token_balance": 1, "second_token_id": "31", "second_token_balance": 1}',
    );
    await expect(client().getExchangeById(12)).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  // A list is a display surface: one poisoned row must not deny the other 199.
  it("drops an invalid row from a list instead of failing the whole page", async () => {
    nodeReturns(
      `{"assetIssue": [${asset()}, ${asset({ id: "2", precision: 99 })}, ${asset({ id: "3" })}]}`,
    );
    const assets = await client().listAssets(10, 0);

    expect(assets.map((a) => a.id)).toEqual(["1002438", "3"]);
  });

  it("drops an invalid match from a name lookup — it can still reach a signing path", async () => {
    nodeReturns(`{"assetIssue": [${asset({ precision: 99 })}, ${asset({ id: "3" })}]}`);
    expect((await client().getAssetsByName("EVIL")).map((a) => a.id)).toEqual(["3"]);
  });
});

/**
 * `tx send --asset-id <id> --amount 1` is the mainstream way to move a TRC10, and it reads its
 * decimals from here rather than from getAssetById — so this method needs the same guarantees, or
 * the most-used signing path keeps the hole the others just closed.
 */
describe("getTrc10Info is held to the same rules as the other TRC10 reads", () => {
  const info = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "1000001",
      name: "4556494c",
      abbr: "4556",
      trx_num: 1,
      num: 1,
      precision: 6,
      ...over,
    });

  it("keeps a valid record and its decoded text", async () => {
    nodeReturns(info());
    await expect(client().getTrc10Info("1000001")).resolves.toMatchObject({
      precision: 6,
      name: "EVIL",
    });
  });

  it("rejects a record answering with a different id", async () => {
    nodeReturns(info({ id: "9999" }));
    await expect(client().getTrc10Info("1000001")).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  it.each([100_000, -1, 1.5, 7])(
    "rejects precision %s, which would rescale a signed amount",
    async (precision) => {
      nodeReturns(info({ precision }));
      await expect(client().getTrc10Info("1000001")).rejects.toMatchObject({
        code: "invalid_node_response",
      });
    },
  );

  it("accepts an absent precision as 0", async () => {
    nodeReturns(info({ precision: undefined }));
    await expect(client().getTrc10Info("1000001")).resolves.toMatchObject({ id: "1000001" });
  });
});
