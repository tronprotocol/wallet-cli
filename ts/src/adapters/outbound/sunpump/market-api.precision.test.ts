/**
 * The precision gate.
 *
 * A recorded mainnet body goes through the real SDK client and the real mapper, and the digits
 * that come out are compared against literals copied from that body by hand. SunPump's market
 * caps carry twenty-six significant digits and its prices eighteen; `JSON.parse` keeps fifteen
 * and says nothing about the rest.
 *
 * The client is real; only the socket is replaced. The adapter's own `jsonParser` is handed
 * through untouched, so if anyone later stops passing `lossless-json` the SDK falls back to
 * `JSON.parse` and these cases go red. The second case makes that explicit by running the same
 * fixture through `JSON.parse` and asserting the result DIFFERS — without it, a test that only
 * checks the good path could not tell a working wiring from a missing one.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SunPumpApiClient } from "@sun-sdk/api";
import { SunPumpMarketApi, type SunPumpApiClientFactory } from "./market-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const BODY = readFileSync(
  fileURLToPath(new URL("./__fixtures__/token-list-market-cap.json", import.meta.url)),
  "utf8",
);

/** Copied character by character out of the recorded body; never computed from it. */
const EXPECTED = {
  marketCapUsd: "20476589.413125372008021816",
  priceInTrx: "0.060088754483023433",
  // 1000000000 whole tokens at 18 decimals — exact only because the scaling is done as text
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

/** a real SunPumpApiClient over the recorded body, keeping whatever parser the adapter supplied. */
const replayingFactory: SunPumpApiClientFactory = (options) =>
  new SunPumpApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: serveFixture,
    jsonParser: options.jsonParser,
  });

/** the same, but forced onto the default parser — the state this gate exists to catch. */
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

  // Proof the wiring is what is doing the work: the same body, the same mapper, the default
  // parser, and the market cap a reader would quote comes out wrong.
  it("would lose digits if the lossless parser were dropped", async () => {
    const token = (await listTokens(lossyFactory)).tokens[0]!;
    expect(token.market.marketCapUsd).not.toBe(EXPECTED.marketCapUsd);
    expect(token.market.priceInTrx).not.toBe(EXPECTED.priceInTrx);
    // and specifically: the 26-digit value lands on the nearest double, whose shortest
    // round-trip spelling is nine digits shorter than what the service sent
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
