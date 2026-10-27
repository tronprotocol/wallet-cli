import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SunPumpApiClient } from "@sun-protocol/sun-sdk-api";
import { SunPumpMarketApi, type SunPumpApiClientFactory } from "./market-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const BODY = readFileSync(
  fileURLToPath(new URL("./__fixtures__/token-list-market-cap.json", import.meta.url)),
  "utf8",
);

// Keep expected values independent of the response parser.
const EXPECTED = {
  marketCapUsd: "20476589.413125372008021816",
  priceInTrx: "0.060088754483023433",
  // One billion tokens scaled to 18 decimals.
  totalSupply: "1000000000000000000000000000",
};

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
  sunpump: { apiBaseUrl: "https://api-v2.sunpump.meme/pump-api" },
} as NetworkDescriptor;

const serveFixture = async () =>
  new Response(BODY, { status: 200, headers: { "content-type": "application/json" } });

const replayingFactory: SunPumpApiClientFactory = (options) =>
  new SunPumpApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: serveFixture,
    jsonParser: options.jsonParser,
  });

const lossyFactory: SunPumpApiClientFactory = (options) =>
  new SunPumpApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: serveFixture,
    jsonParser: (text: string) => JSON.parse(text),
  });

const listTokens = (factory: SunPumpApiClientFactory) =>
  new SunPumpMarketApi(5_000, { clientFactory: factory }).listTokens(MAINNET, {
    sort: "marketCap:DESC",
    pageNo: 1,
    pageSize: 2,
  });

describe("token precision, end to end through the SDK client", () => {
  it("keeps every digit the SunPump API sent", async () => {
    const page = await listTokens(replayingFactory);
    expect(page.tokens).toHaveLength(2);
    const token = page.tokens[0]!;
    expect(token.market.marketCapUsd).toBe(EXPECTED.marketCapUsd);
    expect(token.market.priceInTrx).toBe(EXPECTED.priceInTrx);
    expect(token.totalSupply).toBe(EXPECTED.totalSupply);
  });

  it("would lose digits if the lossless parser were dropped", async () => {
    const token = (await listTokens(lossyFactory)).tokens[0]!;
    expect(token.market.marketCapUsd).not.toBe(EXPECTED.marketCapUsd);
    expect(token.market.priceInTrx).not.toBe(EXPECTED.priceInTrx);
    expect(token.market.marketCapUsd).toBe("20476589.413125373");
    expect(token.market.priceInTrx).toBe("0.060088754483023435");
  });

  it("carries the identifying fields alongside the digits", async () => {
    const token = (await listTokens(replayingFactory)).tokens[0]!;
    expect(token.address).toBe("TNkakCYwNtggwz8WbWhskvonCXNMQ5mqbc");
    expect(token.owner).toBe("TYbwCgQzMP2sDSyf1HrbMcrWRL569qtLZX");
    expect(token.status).toBe("LAUNCHED");
    expect(token.decimals).toBe(18);
  });
});
