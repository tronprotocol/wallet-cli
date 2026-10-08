/**
 * What the published token object is made of.
 *
 * Each case names a field a caller acts on and the literal it must equal, copied out of a
 * recorded mainnet body by hand. A mapping that dropped a field, or moved a value onto the wrong
 * key, or left an amount on the service's scale, fails here rather than reaching a reader as a
 * confident number in the wrong unit.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseLosslessJson } from "lossless-json";
import { isTokenRow, mapToken, utcMinuteFromSeconds } from "./market-api.mapper.js";
import { rawTokenSchema } from "./market-api.schema.js";

function fixture(name: string): unknown {
  return parseLosslessJson(
    readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8"),
  );
}

function detail(name: string) {
  const body = fixture(name) as { data: unknown };
  return mapToken(rawTokenSchema.parse(body.data));
}

describe("a launched token (PUSS), from the detail endpoint", () => {
  const token = detail("token-detail-puss.json");

  it("names the token by its contract, its creator and its state", () => {
    expect(token.address).toBe("TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7");
    expect(token.owner).toBe("TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj");
    expect(token.symbol).toBe("PUSS");
    expect(token.name).toBe("PUSS");
    expect(token.decimals).toBe(18);
    expect(token.status).toBe("LAUNCHED");
  });

  // The service reports a supply of 1000000000 beside `decimals: 18` — whole tokens, not base
  // units. Published unscaled it would understate the supply by eighteen orders of magnitude.
  it("puts the supply and the curve's token figures in base units", () => {
    expect(token.totalSupply).toBe("1000000000000000000000000000");
    expect(token.curve.currentSold).toBe("0");
    expect(token.curve.tokenReserve).toBe("0");
  });

  it("keeps every digit of the market figures, and names their units", () => {
    expect(token.market.marketCapUsd).toBe("3955402.894154087954857341");
    expect(token.market.priceInTrx).toBe("0.011538978919347204");
    expect(token.market.trxPriceInUsd).toBe("0.340814453508");
    // priceInTrx × trxPriceInUsd, by decimal arithmetic rather than by float
    expect(token.market.priceUsd).toBe("0.003932650794437649");
    expect(token.market.priceChange24HrPercent).toBe("0");
    expect(token.market.volume24HrSun).toBe("0");
  });

  it("carries the launch facts, the pool and the farm", () => {
    expect(token.swapPoolAddress).toBe("TH95puFVCkTTYtg6dRLsYGhwAnx24FEEJB");
    expect(token.launchedAt).toBe("2024-08-24 21:36");
    expect(token.createdAt).toBe("2024-08-23 09:00");
    expect(token.createTxHash).toBe(
      "72c29202dc0863a2e28929c5549b6efa3470d412eea37433796fbee04e6fb5e6",
    );
    expect(token.launchTxHash).toBe(
      "8861a26ea43f894c91986b65c5521cb242f6dc8bf4a9b2b7f97e3b104111fcba",
    );
    expect(token.farm).toEqual({
      address: "TLD7nTep2W2hWkgg6YB8irQRWjr8PdmwpQ",
      apy: "0.15930364",
    });
  });

  it("keeps the creator's links and drops the empty ones", () => {
    expect(token.links).toEqual({
      logo: "https://cdn.sunpump.meme/public/logo/PUSS_TQRxQN_ls9y5lDjLoeb.png",
      twitter: "https://x.com/pussmemecoin",
      telegram: "https://t.me/+ilhuIKrbgCYzZjI1",
      website: "https://puss.meme",
    });
  });

  // The service names every exchange it knows about and leaves the URL blank for the ones this
  // token is not on; forwarding the map verbatim would claim thirteen listings where there are six.
  it("keeps only the exchanges the token is actually listed on", () => {
    expect(token.listOn?.MEXC).toBe("https://www.mexc.com/exchange/PUSS_USDT?_from=market");
    expect(Object.values(token.listOn ?? {})).not.toContain("");
    expect(token.listOn).not.toHaveProperty("HTX");
    expect(token.listOn).not.toHaveProperty("Binance");
  });

  it("publishes no holder count, because the service's is always zero", () => {
    expect(token).not.toHaveProperty("holders");
  });
});

describe("a token still on the curve (BabyKnight)", () => {
  const token = detail("token-detail-babyknight.json");

  it("reports the curve's progress and both reserves", () => {
    expect(token.status).toBe("CREATED");
    expect(token.curve.pumpPercentage).toBe("1");
    // whole tokens on the wire (775791072.79), base units here
    expect(token.curve.tokenReserve).toBe("775791072790000000000000000");
    // TRX, kept in the service's own decimal unit
    expect(token.curve.trxReserve).toBe("810.21");
  });

  // Before launch there is no pool, no launch time and no launch transaction. The service sends
  // "" and null for them; a key present with an empty value would read as a pool with no address.
  it("omits every launch fact rather than publishing an empty one", () => {
    expect(token).not.toHaveProperty("swapPoolAddress");
    expect(token).not.toHaveProperty("launchedAt");
    expect(token).not.toHaveProperty("launchTxHash");
    expect(token).not.toHaveProperty("listOn");
    expect(token).not.toHaveProperty("farm");
  });
});

describe("a search result", () => {
  const body = fixture("search-knight.json") as { data: { tokens: unknown[] } };
  const tokens = body.data.tokens.map((row) => mapToken(rawTokenSchema.parse(row)));

  it("publishes no USD price, because the listings send no TRX rate", () => {
    expect(tokens[0]?.market.trxPriceInUsd).toBeUndefined();
    expect(tokens[0]?.market.priceUsd).toBeUndefined();
  });

  // The search endpoint sends `stakeApy` and omits `stakeAddress`. A farm with an APY and no
  // contract to stake at is not something a caller can use, so no farm is published.
  it("publishes no farm without a farm contract", () => {
    for (const token of tokens) expect(token).not.toHaveProperty("farm");
  });

  it("keeps the full precision of a market cap the service sent with 26 digits", () => {
    expect(tokens[0]?.market.marketCapUsd).toBe("53265.789001162823561562");
  });
});

describe("shapes the service produces that must not become a token", () => {
  it("treats a row with no contract address as not a token", () => {
    expect(isTokenRow(undefined)).toBe(false);
    expect(isTokenRow(null)).toBe(false);
    expect(isTokenRow({ symbol: "GHOST" })).toBe(false);
    expect(isTokenRow({ contractAddress: "" })).toBe(false);
    expect(isTokenRow({ contractAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" })).toBe(true);
  });

  it("expands the scientific notation the service uses for very small prices", () => {
    const token = mapToken(
      rawTokenSchema.parse({
        contractAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        decimals: 18,
        priceInTrx: "7.0681158928211e-05",
        // TRX with six decimals on the wire; SUN once published
        volume24Hr: "17690.568387",
        pumpPercentage: "100.0",
      }),
    );
    expect(token.market.priceInTrx).toBe("0.000070681158928211");
    expect(token.market.volume24HrSun).toBe("17690568387");
    expect(token.curve.pumpPercentage).toBe("100");
  });

  it("answers an absent timestamp with nothing rather than with the epoch", () => {
    expect(utcMinuteFromSeconds(null)).toBe("");
    expect(utcMinuteFromSeconds(undefined)).toBe("");
    expect(utcMinuteFromSeconds("0")).toBe("");
    expect(utcMinuteFromSeconds("1724535408")).toBe("2024-08-24 21:36");
  });
});
