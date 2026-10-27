import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SunApiClient } from "@sun-protocol/sun-sdk-api";
import { SunSwapMarketApi, type SunApiClientFactory } from "./market-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const BODY = readFileSync(
  fileURLToPath(new URL("./__fixtures__/positions-user-v4-88.json", import.meta.url)),
  "utf8",
);

// Expected digits are copied from the fixture, not computed through the parser under test.
const EXPECTED = {
  lpBalanceAmount: "392657176790371861588",
  positionLiquidity: "392657176790371861588",
  derivedToken0Amount: "1961161232999063830653955",
  lpBalanceUsd: "1960034.158363120117210649",
};

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
  sunswap: { marketApiBaseUrl: "https://open.sun.io" },
} as NetworkDescriptor;

const OWNER = "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N";
const POOL = "61446c8062cdc7f165946650c5ca6b6aa1809d19fcdf69b58824b01dd581333e";

const serveFixture = async () =>
  new Response(BODY, { status: 200, headers: { "content-type": "application/json" } });

const replayingFactory: SunApiClientFactory = (options) =>
  new SunApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: serveFixture,
    jsonParser: options.jsonParser,
  });

const lossyFactory: SunApiClientFactory = (options) =>
  new SunApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: serveFixture,
    jsonParser: (text: string) => JSON.parse(text),
  });

const listPositions = (factory: SunApiClientFactory) =>
  new SunSwapMarketApi(5_000, { clientFactory: factory }).listPositions(MAINNET, {
    owner: OWNER,
    pool: POOL,
    pageNo: 1,
    pageSize: 10,
  });

describe("position precision, end to end through the SDK client", () => {
  it("keeps every digit the market API sent", async () => {
    const page = await listPositions(replayingFactory);
    expect(page.positions).toHaveLength(1);
    const position = page.positions[0]!;
    expect(position.lpBalanceAmount).toBe(EXPECTED.lpBalanceAmount);
    expect(position.lpBalanceUsd).toBe(EXPECTED.lpBalanceUsd);
    expect(position.extra.positionLiquidity).toBe(EXPECTED.positionLiquidity);
    expect(position.extra.derivedToken0Amount).toBe(EXPECTED.derivedToken0Amount);
  });

  it("would lose digits if the lossless parser were dropped", async () => {
    const page = await listPositions(lossyFactory);
    const position = page.positions[0]!;
    expect(position.lpBalanceAmount).not.toBe(EXPECTED.lpBalanceAmount);
    expect(position.extra.positionLiquidity).not.toBe(EXPECTED.positionLiquidity);
    expect(position.extra.derivedToken0Amount).not.toBe(EXPECTED.derivedToken0Amount);
    expect(position.lpBalanceUsd).not.toBe(EXPECTED.lpBalanceUsd);
    expect(position.lpBalanceAmount).toBe("392657176790371860000");
  });

  it("carries the identifying fields alongside the digits", async () => {
    const position = (await listPositions(replayingFactory)).positions[0]!;
    expect(position.owner).toBe(OWNER);
    expect(position.poolAddress).toBe(POOL);
    expect(position.protocol).toBe("V4");
    expect(position.nftTokenId).toBe("88");
    expect(position.status).toBe("IN_RANGE");
  });
});
