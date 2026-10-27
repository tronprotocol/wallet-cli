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

  it("drops id", () => {
    expect(mapToken(tokenFixture())).not.toHaveProperty("id");
  });

  it("keeps money and rates as digit strings, counts as numbers", () => {
    const token = mapToken(tokenFixture());
    expect(typeof token.priceUsd).toBe("string");
    expect(typeof token.reserveUsd).toBe("string");
    expect(typeof token.priceUsd1dRate).toBe("string");
    expect(typeof token.transaction1d).toBe("number");
    expect(typeof token.transactionRecentTotal).toBe("number");
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

  it("drops id, contractIndex and lpPriceUsd", () => {
    const pool = mapPool(poolFixture());
    expect(pool).not.toHaveProperty("id");
    expect(pool).not.toHaveProperty("contractIndex");
    expect(pool).not.toHaveProperty("lpPriceUsd");
  });

  it("carries the raw rates for the use case rather than publishing them", () => {
    expect(mapPool(poolFixture()).rates).toEqual(["2.909173910769221638008798715979251686941"]);
  });

  it("converts the creation timestamp from epoch milliseconds", () => {
    expect(mapPool(poolFixture()).createdAt).toBe(epochMsToUtcMinute("1687879410000"));
    expect(mapPool(poolFixture()).createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("camelCases extra without normalising its shape", () => {
    const extra = mapPool(poolFixture()).extra;
    expect(typeof extra.tick).toBe("number");
    expect(typeof extra.liquidity).toBe("string");
    expect(extra).toHaveProperty("sqrtPriceX96");
    expect(extra).not.toHaveProperty("protocol_fee_rate_token0");
    expect(extra).toHaveProperty("protocolFeeRateToken0");
  });

  it("decodes the tick spacing and names the hook on a V4 pool", () => {
    const extra = mapPool(poolFixture(2)).extra;
    expect(mapPool(poolFixture(2)).protocol).toBe("V4");
    expect(extra.tickSpacing).toBe(10);
    expect(extra.parameters).toMatch(/0a0000$/);
    expect(extra.hooks).toBe("none");
    expect(extra.hooks).not.toContain("T9yD14");
  });

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

describe("market numeric bounds", () => {
  it.each(["-1", "1.5", "78", "9999999999", "NaN", "Infinity"])(
    "rejects unsupported API decimals %s",
    (decimals) => {
      for (const map of [mapPosition, mapPool]) {
        expect(() =>
          map({ tokenAddressList: ["token"], tokenDecimalList: [decimals] } as never),
        ).toThrow(expect.objectContaining({ code: "invalid_node_response" }));
      }
      expect(() => mapToken({ tokenDecimal: decimals } as never)).toThrow(
        expect.objectContaining({ code: "invalid_node_response" }),
      );
    },
  );
  it("rejects oversized exponent prices", () => {
    expect(() =>
      mapPosition({
        tokenAddressList: ["token"],
        tokenDecimalList: ["6"],
        tokenPriceUsdList: ["1e9999999999"],
      } as never),
    ).toThrow(expect.objectContaining({ code: "invalid_node_response" }));
  });
});
