import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseLosslessJson } from "lossless-json";
import {
  camelCase,
  epochMsToUtcMinute,
  mapPool,
  mapPosition,
  mapToken,
  toUtcMinute,
} from "./market-api.mapper.js";
import {
  positionsResponseSchema,
  poolsResponseSchema,
  tokensResponseSchema,
  type RawPool,
  type RawPosition,
  type RawToken,
} from "./market-api.schema.js";

const fixture = () => {
  const body = readFileSync(
    fileURLToPath(new URL("./__fixtures__/positions-user-v4-88.json", import.meta.url)),
    "utf8",
  );
  const envelope = parseLosslessJson(body) as { data: unknown };
  return positionsResponseSchema.parse(envelope.data).list[0] as RawPosition;
};

describe("mapPosition", () => {
  it("folds the parallel token arrays into one record per token", () => {
    const position = mapPosition(fixture());
    expect(position.tokens).toHaveLength(2);
    expect(position.tokens[0]).toMatchObject({
      address: "TFNirp6PbqYE1ZTtWuCMUKJWLNZkoCoeFJ",
      symbol: "U",
      name: "United Stables",
      decimals: 18,
    });
    expect(position.tokens[1]?.symbol).toBe("USDT");
  });

  // The source gives a decimal token amount; a caller needs base units it can pass to a contract.
  it("converts token amounts to base units using each token's own decimals", () => {
    const position = mapPosition(fixture());
    expect(position.tokens[0]?.amount).toBe("1070163618808583559303388");
    expect(position.tokens[1]?.amount).toBe("890592582622");
  });

  it("folds token_reward_amount_list into the token records and drops it from extra", () => {
    const position = mapPosition(fixture());
    expect(position.tokens[0]?.rewardAmount).toBe("252809441421518969671");
    expect(position.tokens[1]?.rewardAmount).toBe("245748099");
    expect(position.extra).not.toHaveProperty("tokenRewardAmountList");
  });

  it("renames userAddress to owner", () => {
    expect(mapPosition(fixture()).owner).toBe("TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N");
  });

  // A V4 position is an NFT; one price per LP token describes nothing about it.
  it("drops lpPriceUsd on V3 and V4 but keeps it elsewhere", () => {
    expect(mapPosition(fixture())).not.toHaveProperty("lpPriceUsd");
    const v2 = mapPosition({ ...fixture(), protocol: "V2", lpPriceUsd: "1.25" } as RawPosition);
    expect(v2.lpPriceUsd).toBe("1.25");
  });

  it("camelCases extraInfo and keeps tick indices as integers", () => {
    const extra = mapPosition(fixture()).extra;
    expect(extra.tickLower).toBe(-276374);
    expect(extra.tickUpper).toBe(-276274);
    expect(extra.isDynamicFee).toBe(false);
    expect(extra.parameters).toBe(
      "0000000000000000000000000000000000000000000000000000000000010000",
    );
  });

  it("keeps money-like extraInfo members as digit strings", () => {
    const extra = mapPosition(fixture()).extra;
    expect(typeof extra.positionLiquidity).toBe("string");
    expect(typeof extra.derivedToken0Amount).toBe("string");
    expect(typeof extra.tokenRewardUsd).toBe("string");
  });

  it("truncates lastActiveBlockTime to the minute", () => {
    expect(mapPosition(fixture()).lastActiveAt).toBe("2026-03-31 16:10");
  });

  // The service sends an empty string rather than omitting the field for the protocols that have
  // no NFT, and publishing that would put a bare "#" in the id column and a meaningless json key.
  it("omits nftTokenId when the protocol has no position NFT", () => {
    expect(mapPosition({ ...fixture(), nftTokenId: "" } as RawPosition)).not.toHaveProperty(
      "nftTokenId",
    );
    expect(mapPosition(fixture()).nftTokenId).toBe("88");
  });

  it("survives a record with none of the optional arrays", () => {
    const position = mapPosition({} as RawPosition);
    expect(position.tokens).toEqual([]);
    expect(position.extra).toEqual({});
    expect(position.owner).toBe("");
  });
});

describe("toUtcMinute", () => {
  // The API sends no zone. Reading the string through Date would apply the machine's own, so the
  // same listing would read differently in Taipei and in CI — hence characters, not dates.
  it("gives the same answer whatever the machine's zone is", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "Asia/Taipei", "America/Los_Angeles"]) {
        process.env.TZ = zone;
        expect(toUtcMinute("2026-03-31 16:10:12")).toBe("2026-03-31 16:10");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("accepts the ISO spelling and leaves anything else alone", () => {
    expect(toUtcMinute("2026-03-31T16:10:12")).toBe("2026-03-31 16:10");
    expect(toUtcMinute("")).toBe("");
    expect(toUtcMinute("soon")).toBe("soon");
  });
});

describe("camelCase", () => {
  it("converts snake_case and leaves camelCase alone", () => {
    expect(camelCase("derived_token0_amount")).toBe("derivedToken0Amount");
    expect(camelCase("is_dynamic_fee")).toBe("isDynamicFee");
    expect(camelCase("lpBalanceUsd")).toBe("lpBalanceUsd");
  });
});

const tokenFixture = () => {
  const body = readFileSync(
    fileURLToPath(new URL("./__fixtures__/tokens.json", import.meta.url)),
    "utf8",
  );
  const envelope = parseLosslessJson(body) as { data: unknown };
  return tokensResponseSchema.parse(envelope.data).list[0] as RawToken;
};

describe("mapToken", () => {
  it("strips the redundant token prefix the service puts on half its fields", () => {
    const token = mapToken(tokenFixture());
    expect(token).toMatchObject({
      address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      symbol: "TRX",
      name: "TRX",
      decimals: 6,
      protocol: "ALL",
    });
    expect(token).not.toHaveProperty("tokenAddress");
  });

  it("renames the two list members to what they hold", () => {
    const token = mapToken(tokenFixture());
    expect(token.relevantProtocols).toContain("V3");
    expect(token.relevantPools.length).toBeGreaterThan(0);
    expect(token).not.toHaveProperty("relevantPoolAddressList");
  });

  // An internal row key no caller can use for anything.
  it("drops id", () => {
    expect(mapToken(tokenFixture())).not.toHaveProperty("id");
  });

  // Money and rates outrun a float; counts do not, and a caller wants them as numbers.
  it("keeps money and rates as digit strings, counts as numbers", () => {
    const token = mapToken(tokenFixture());
    expect(typeof token.priceUsd).toBe("string");
    expect(typeof token.reserveUsd).toBe("string");
    expect(typeof token.priceUsd1dRate).toBe("string");
    expect(typeof token.transaction1d).toBe("number");
    expect(typeof token.transactionRecentTotal).toBe("number");
    // full precision survives, well past what a float holds
    expect(token.reserveUsd).toMatch(/^\d+\.\d{10,}$/);
  });

  it("survives a record with none of the optional fields", () => {
    const token = mapToken({} as RawToken);
    expect(token.address).toBe("");
    expect(token.relevantPools).toEqual([]);
    expect(token.decimals).toBe(0);
  });
});

const poolFixture = (index = 0) => {
  const body = readFileSync(
    fileURLToPath(new URL("./__fixtures__/pools.json", import.meta.url)),
    "utf8",
  );
  const envelope = parseLosslessJson(body) as { data: unknown };
  return poolsResponseSchema.parse(envelope.data).list[index] as RawPool;
};

describe("mapPool", () => {
  it("folds the parallel arrays into one record per token", () => {
    const pool = mapPool(poolFixture());
    expect(pool.tokens).toHaveLength(2);
    expect(pool.tokens[0]).toMatchObject({ symbol: "WTRX", decimals: 6 });
    expect(pool.tokens[1]?.symbol).toBe("USDT");
  });

  it("converts reserves and 24h volume to base units per token", () => {
    const pool = mapPool(poolFixture());
    expect(pool.tokens[0]?.amount).toBe("227424711008461");
    expect(pool.tokens[0]?.volume1d).toBe("99066784099966");
  });

  // Database keys and a field that is a constant 0 on V3/V4 — nothing a caller can use.
  it("drops id, contractIndex and lpPriceUsd", () => {
    const pool = mapPool(poolFixture());
    expect(pool).not.toHaveProperty("id");
    expect(pool).not.toHaveProperty("contractIndex");
    expect(pool).not.toHaveProperty("lpPriceUsd");
  });

  // The orientation of swapRateList is a service detail; the use case turns it into a price.
  it("carries the raw rates for the use case rather than publishing them", () => {
    expect(mapPool(poolFixture()).rates).toEqual(["2.909173910769221638008798715979251686941"]);
  });

  it("converts the creation timestamp from epoch milliseconds", () => {
    expect(mapPool(poolFixture()).createdAt).toBe(epochMsToUtcMinute("1687879410000"));
    expect(mapPool(poolFixture()).createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  // extraInfo genuinely differs per protocol; flattening it would invent a shape that is not
  // there. Ticks stay integers, everything money-like stays a digit string.
  it("camelCases extra without normalising its shape", () => {
    const extra = mapPool(poolFixture()).extra;
    expect(typeof extra.tick).toBe("number");
    expect(typeof extra.liquidity).toBe("string");
    expect(extra).toHaveProperty("sqrtPriceX96");
    expect(extra).not.toHaveProperty("protocol_fee_rate_token0");
    expect(extra).toHaveProperty("protocolFeeRateToken0");
  });

  /**
   * A V4 row has to be enough to name the pool again.
   *
   * `add-liquidity` takes a V4 pool by its parts, and two of them were unreadable here: the tick
   * spacing lived only inside the raw `parameters` word and the hook was simply absent when the
   * pool had none. Both are published now, derived from the row itself.
   */
  it("decodes the tick spacing and names the hook on a V4 pool", () => {
    const extra = mapPool(poolFixture(2)).extra;
    expect(mapPool(poolFixture(2)).protocol).toBe("V4");
    // 0x…0a0000 is spacing 10, and the raw word stays beside it.
    expect(extra.tickSpacing).toBe(10);
    expect(extra.parameters).toMatch(/0a0000$/);
    // The word for absence, never the zero address — which on TRON also means native TRX.
    expect(extra.hooks).toBe("none");
    expect(extra.hooks).not.toContain("T9yD14");
  });

  // V2 and V3 rows have no pool key of this shape, so they gain nothing.
  it.each([
    ["V3", 0],
    ["V2", 1],
  ])("adds neither field to a %s row", (_protocol, index) => {
    const extra = mapPool(poolFixture(index)).extra;
    expect(extra).not.toHaveProperty("tickSpacing");
    expect(extra).not.toHaveProperty("hooks");
  });

  it("keeps money as digit strings and counts as numbers", () => {
    const pool = mapPool(poolFixture());
    expect(typeof pool.reserveUsd).toBe("string");
    expect(typeof pool.feeRate).toBe("string");
    expect(typeof pool.transaction1d).toBe("number");
  });

  it("survives a record with none of the optional fields", () => {
    const pool = mapPool({} as RawPool);
    expect(pool.tokens).toEqual([]);
    expect(pool.rates).toEqual([]);
    expect(pool.extra).toEqual({});
  });
});
