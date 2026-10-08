/**
 * What `sunpump launch` puts on the wire, and what it makes of the answer.
 *
 * 🔴 No token was ever created to write these: creating one on SunPump is permanent, public and
 * irreversible, and mainnet is the only network the service runs on. So the response bodies here
 * are built from the create response's documented shape and the catalogue's own token shape —
 * which the mapper is already tested against in `market-api.mapper.test.ts` — and the
 * CREATE-SPECIFIC parts are what these cases exist for: the request body, the millisecond-÷-10^6
 * instants, and a refusal that arrives with HTTP 200.
 *
 * The body is asserted WHOLE rather than field by field, so a dropped option and a misnamed one
 * both go red. That matters here more than anywhere else in this folder: this service ignores a
 * field it does not recognise, so a wrong name is not an error — it is a permanent token created
 * without a website.
 */
import { describe, expect, it } from "vitest";
import { SunPumpLaunchApi } from "./launch-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { CliError } from "../../../domain/errors/index.js";

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
  sunpump: { apiBaseUrl: "https://api-v2.sunpump.meme/pump-api" },
} as NetworkDescriptor;

/** Nile: the SDK's chain config has no SunPump endpoint, so there is nothing to create on. */
const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  nativeSymbol: "TRX",
  capabilities: [],
} as NetworkDescriptor;

/**
 * A created token as the create endpoint reports it.
 *
 * `tokenCreatedInstant` is PLAIN SECONDS, the same scale every query endpoint of this service uses.
 * MEASURED by creating a real token on mainnet 2026-09-28: the value came back `1790535759`, and
 * reading the SAME token through `token-info` gave the same figure. The create response does not
 * use a different unit.
 */
const CREATED = {
  contractAddress: "TNfW9m6BzWpZ4gZ8y8sJQ8PjRKzvGx1a9x",
  ownerAddress: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
  symbol: "TST",
  name: "Test Token",
  description: "demo",
  status: "CREATED",
  decimals: 18,
  totalSupply: 1000000000,
  currentSold: 0,
  tokenReserve: 800000000,
  trxReserve: 0,
  pumpPercentage: 0,
  priceInTrx: 3.2710280376636e-5,
  priceChange24Hr: 0,
  volume24Hr: 0,
  marketCap: 11078.22,
  virtualLiquidity: 23707.39,
  trxPriceInUsd: null,
  tokenCreatedInstant: 1790535759,
  tokenLaunchedInstant: null,
  createTxHash: "9f2c1d0aa1b6f0f3b0d1e2c3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c77ad",
  logoUrl: "https://static.sunpump.meme/logo/tst.png",
  websiteUrl: "https://example.com",
};

/** records every POST, and answers with one body. */
function transport(body: unknown, status = 200) {
  const calls: { url: string; method?: string; body: unknown }[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      ...(init?.method === undefined ? {} : { method: init.method }),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { calls, fetchImpl };
}

const ok = (data: unknown) => ({ code: 0, msg: "SUCCESS", data });

const api = (fetchImpl: typeof globalThis.fetch) => new SunPumpLaunchApi(5_000, { fetchImpl });

describe("the request body", () => {
  it("carries every option it was given, under the names the service reads", async () => {
    const { calls, fetchImpl } = transport(ok(CREATED));
    await api(fetchImpl).launchToken(MAINNET, {
      name: "Test Token",
      symbol: "TST",
      description: "demo",
      imageBase64: "QUJDRA==",
      twitterUrl: "https://x.com/example",
      telegramUrl: "https://t.me/example",
      websiteUrl: "https://example.com",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api-v2.sunpump.meme/pump-api/ai/agentTokenLaunch");
    // Whole-body equality on purpose: a dropped field, a misspelled field and an invented one all
    // fail here, and none of the three would fail against the live service.
    expect(calls[0]!.body).toEqual({
      name: "Test Token",
      symbol: "TST",
      description: "demo",
      imageBase64: "QUJDRA==",
      twitterUrl: "https://x.com/example",
      telegramUrl: "https://t.me/example",
      websiteUrl: "https://example.com",
    });
  });

  // An absent option must be ABSENT, not "". The service stores what it is given, so an empty
  // website would be a permanent token whose link goes nowhere.
  it("omits every option that was not given rather than sending it empty", async () => {
    const { calls, fetchImpl } = transport(ok(CREATED));
    await api(fetchImpl).launchToken(MAINNET, {
      name: "Test Token",
      symbol: "TST",
      description: "demo",
    });
    expect(calls[0]!.body).toEqual({ name: "Test Token", symbol: "TST", description: "demo" });
  });

  // The SDK declares `tweetUsername`, the CLI has no flag for it, and nothing may invent one.
  it("has no field nobody can set", async () => {
    const { calls, fetchImpl } = transport(ok(CREATED));
    await api(fetchImpl).launchToken(MAINNET, {
      name: "Test Token",
      symbol: "TST",
      description: "demo",
    });
    expect(Object.keys(calls[0]!.body as object)).not.toContain("tweetUsername");
  });

  it("refuses a network with no SunPump endpoint instead of falling back to mainnet", async () => {
    const { calls, fetchImpl } = transport(ok(CREATED));
    await expect(
      api(fetchImpl).launchToken(NILE, { name: "T", symbol: "T", description: "d" }),
    ).rejects.toMatchObject({ code: "unsupported_network" });
    expect(calls).toEqual([]);
  });
});

describe("the created token", () => {
  it("is mapped by the same mapper the catalogue uses", async () => {
    const { fetchImpl } = transport(ok(CREATED));
    const token = await api(fetchImpl).launchToken(MAINNET, {
      name: "Test Token",
      symbol: "TST",
      description: "demo",
    });
    expect(token).toMatchObject({
      address: "TNfW9m6BzWpZ4gZ8y8sJQ8PjRKzvGx1a9x",
      symbol: "TST",
      name: "Test Token",
      status: "CREATED",
      owner: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
      decimals: 18,
      // whole tokens in, base units out — the catalogue's rule, unchanged
      totalSupply: "1000000000000000000000000000",
      description: "demo",
      links: { logo: "https://static.sunpump.meme/logo/tst.png", website: "https://example.com" },
      createTxHash: "9f2c1d0aa1b6f0f3b0d1e2c3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c77ad",
    });
    // The price arrived in scientific notation and is published as plain digits, as elsewhere.
    expect(token.market.priceInTrx).toBe("0.000032710280376636");
    expect(token.launchedAt).toBeUndefined();
  });

  /**
   * ONE scale for both paths, which is the property that matters.
   *
   * Rescaling this field by 1000, as if the create response used a different unit, dates a token
   * made that minute to `+058709-10-27`, while `token-info` reads the same token back correctly —
   * two paths disagreeing about one field, both answering `success: true`. Only the absurd year
   * makes that visible; a smaller error would not be.
   */
  it("reads the create endpoint's instants on the same scale as the query endpoints", async () => {
    const { fetchImpl } = transport(ok(CREATED));
    const token = await api(fetchImpl).launchToken(MAINNET, {
      name: "Test Token",
      symbol: "TST",
      description: "demo",
    });
    expect(token.createdAt).toBe("2026-09-27 19:02");
  });

  /**
   * An instant we cannot read publishes NO date, not a wrong one.
   *
   * The measured service sends an integer, so a fractional value should never arrive. The previous
   * version of this case asserted that a fraction was TRUNCATED — a behaviour of the rescaling that
   * has since been removed, and one that only ever existed to serve a format the service does not
   * use. What replaces it is the property worth having: an unreadable instant leaves the field
   * empty, because a date is a fact and a guessed one is worse than none.
   */
  it("publishes no date for an instant it cannot read", async () => {
    const { fetchImpl } = transport(ok({ ...CREATED, tokenCreatedInstant: "not-a-time" }));
    const token = await api(fetchImpl).launchToken(MAINNET, {
      name: "T",
      symbol: "T",
      description: "d",
    });
    expect(token.createdAt).toBeFalsy();
  });

  it("reads the token from data.token when the service nests it there", async () => {
    const { fetchImpl } = transport(ok({ token: CREATED }));
    const token = await api(fetchImpl).launchToken(MAINNET, {
      name: "T",
      symbol: "T",
      description: "d",
    });
    expect(token.address).toBe("TNfW9m6BzWpZ4gZ8y8sJQ8PjRKzvGx1a9x");
  });
});

describe("failures", () => {
  // The defining trap of this service: a refusal is an HTTP 200 with a non-zero code. Untranslated
  // it would be reported as a created token, which is the one failure this adapter must not have.
  it("translates a refusal that arrives as HTTP 200", async () => {
    const { fetchImpl } = transport({ code: 1, msg: "Invalid request parameter: description" });
    const error = await api(fetchImpl)
      .launchToken(MAINNET, { name: "T", symbol: "T", description: "" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject({
      code: "provider_error",
      details: { apiCode: 1, apiMessage: "Invalid request parameter: description" },
    });
  });

  it("says plainly that a token may exist when the service names none", async () => {
    const { fetchImpl } = transport(ok({}));
    const error = await api(fetchImpl)
      .launchToken(MAINNET, { name: "T", symbol: "T", description: "d" })
      .catch((e: unknown) => e as CliError);
    expect((error as CliError).code).toBe("provider_error");
    expect((error as CliError).message).toMatch(/accepted the launch and returned no token/);
    expect((error as CliError).message).toMatch(/token-list --owner/);
  });

  it("names a rate limit as one", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 429, headers: { "retry-after": "30" } })) as typeof fetch;
    await expect(
      api(fetchImpl).launchToken(MAINNET, { name: "T", symbol: "T", description: "d" }),
    ).rejects.toMatchObject({
      code: "provider_rate_limited",
      details: { retryAfterSeconds: 30 },
    });
  });
});
