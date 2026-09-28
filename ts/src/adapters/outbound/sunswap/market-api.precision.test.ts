/**
 * The precision gate (D5/D5a).
 *
 * A recorded mainnet body goes through the real SDK client and the real mapper, and the digits
 * that come out are compared against literals copied from that body by hand. These are values a
 * user acts on: `position_liquidity` is what they paste into a remove-liquidity call, and it is
 * 21 digits — six past what a float can hold.
 *
 * The client is real; only the socket is replaced. The adapter's own `jsonParser` is handed
 * through untouched, so if anyone later stops passing `lossless-json` the SDK falls back to
 * `JSON.parse` and these cases go red. The last case makes that explicit by running the same
 * fixture through `JSON.parse` and asserting the result DIFFERS — without it, a test that only
 * checks the good path could not tell a working wiring from a missing one.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SunApiClient } from "@sun-sdk/api";
import { SunSwapMarketApi, type SunApiClientFactory } from "./market-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const BODY = readFileSync(
  fileURLToPath(new URL("./__fixtures__/positions-user-v4-88.json", import.meta.url)),
  "utf8",
);

/** Copied character by character out of the recorded body; never computed from it. */
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

/** a real SunApiClient over the recorded body, keeping whatever parser the adapter supplied. */
const replayingFactory: SunApiClientFactory = (options) =>
  new SunApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: serveFixture,
    jsonParser: options.jsonParser,
  });

/** the same, but forced onto the default parser — the state this gate exists to catch. */
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

  // Proof the wiring is what is doing the work: the same body, the same mapper, the default
  // parser, and the number a user would copy comes out wrong.
  it("would lose digits if the lossless parser were dropped", async () => {
    const page = await listPositions(lossyFactory);
    const position = page.positions[0]!;
    expect(position.lpBalanceAmount).not.toBe(EXPECTED.lpBalanceAmount);
    expect(position.extra.positionLiquidity).not.toBe(EXPECTED.positionLiquidity);
    expect(position.extra.derivedToken0Amount).not.toBe(EXPECTED.derivedToken0Amount);
    expect(position.lpBalanceUsd).not.toBe(EXPECTED.lpBalanceUsd);
    // and specifically: the 21-digit value lands on the nearest double, whose shortest
    // round-trip spelling ends in four zeros the API never sent
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
