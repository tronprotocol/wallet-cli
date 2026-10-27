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

const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  nativeSymbol: "TRX",
  capabilities: [],
} as NetworkDescriptor;

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

  it("omits every option that was not given rather than sending it empty", async () => {
    const { calls, fetchImpl } = transport(ok(CREATED));
    await api(fetchImpl).launchToken(MAINNET, {
      name: "Test Token",
      symbol: "TST",
      description: "demo",
    });
    expect(calls[0]!.body).toEqual({ name: "Test Token", symbol: "TST", description: "demo" });
  });

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
      totalSupply: "1000000000000000000000000000",
      description: "demo",
      links: { logo: "https://static.sunpump.meme/logo/tst.png", website: "https://example.com" },
      createTxHash: "9f2c1d0aa1b6f0f3b0d1e2c3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c77ad",
    });
    expect(token.market.priceInTrx).toBe("0.000032710280376636");
    expect(token.launchedAt).toBeUndefined();
  });

  it("reads the create endpoint's instants on the same scale as the query endpoints", async () => {
    const { fetchImpl } = transport(ok(CREATED));
    const token = await api(fetchImpl).launchToken(MAINNET, {
      name: "Test Token",
      symbol: "TST",
      description: "demo",
    });
    expect(token.createdAt).toBe("2026-09-27 19:02");
  });

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
    expect(error).toMatchObject({
      code: "launch_outcome_unknown",
      details: { name: "T", symbol: "T" },
    });
    expect((error as CliError).message).toMatch(/accepted the launch and returned no token/);
    expect((error as CliError).message).toMatch(/sunpump token-search "T"/);
  });

  it("reports a timeout as an unknown outcome, not as a retryable timeout", async () => {
    let sent = 0;
    const fetchImpl = ((_input: unknown, init?: RequestInit) => {
      sent += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    }) as typeof fetch;
    const error = await new SunPumpLaunchApi(20, { fetchImpl })
      .launchToken(MAINNET, { name: "WqaR111008", symbol: "WQ111008", description: "d" })
      .catch((e: unknown) => e as CliError);
    expect(sent).toBe(1);
    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject({
      code: "launch_outcome_unknown",
      details: { name: "WqaR111008", symbol: "WQ111008" },
    });
    expect((error as CliError).message).toMatch(/did not answer within 20 ms/);
    expect((error as CliError).message).toMatch(/sunpump token-search "WQ111008"/);
  });

  it.each([
    [
      "a 5xx",
      () => new Response("bad gateway", { status: 502 }),
      { failure: "provider_error", httpStatus: 502 },
    ],
    [
      "a body that is not JSON",
      () => new Response("<html>", { status: 200 }),
      { failure: "provider_error", httpStatus: 200 },
    ],
    ["an empty body", () => new Response("", { status: 200 }), { failure: "provider_error" }],
    [
      "a dropped connection",
      () => {
        throw new TypeError("fetch failed");
      },
      { failure: "provider_error" },
    ],
  ])("reports %s as an unknown outcome", async (_label, answer, failure) => {
    const fetchImpl = (async () => answer()) as typeof fetch;
    const error = await api(fetchImpl)
      .launchToken(MAINNET, { name: "T", symbol: "T", description: "d" })
      .catch((e: unknown) => e as CliError);
    expect(error).toMatchObject({
      code: "launch_outcome_unknown",
      details: { name: "T", symbol: "T", ...failure },
    });
    expect((error as CliError).message).toMatch(/may have created the token anyway/);
  });

  it("passes a 4xx through as the refusal it is", async () => {
    const fetchImpl = (async () => new Response("bad request", { status: 400 })) as typeof fetch;
    await expect(
      api(fetchImpl).launchToken(MAINNET, { name: "T", symbol: "T", description: "d" }),
    ).rejects.toMatchObject({ code: "provider_error", details: { httpStatus: 400 } });
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
