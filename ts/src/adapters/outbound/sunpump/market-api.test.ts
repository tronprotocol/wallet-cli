/**
 * What this adapter puts on the wire, and what it refuses to publish.
 *
 * 🔴 The parameter names are the subject of most of these cases, because this service does not
 * reject an unknown one: it ignores it and answers 200 with an UNFILTERED list. A misspelled
 * search parameter therefore returns the whole catalogue and looks entirely healthy. The fake
 * transport below serves the filtered body ONLY when the exact parameter is present and the
 * unfiltered catalogue otherwise, so a test that checks the rows cannot pass on a wrong name.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SunPumpMarketApi } from "./market-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { CliError } from "../../../domain/errors/index.js";

const body = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");

const KNIGHT = body("search-knight.json");
const UNFILTERED = body("search-unfiltered.json");
const BY_OWNER = body("tokens-by-owner.json");
const LIST = body("token-list-market-cap.json");
const PUSS = body("token-detail-puss.json");

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
  sunpump: { apiBaseUrl: "https://api-v2.sunpump.meme/pump-api" },
} as NetworkDescriptor;

/** Nile: the SDK's chain config has no SunPump endpoint at all, so there is nothing to ask. */
const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  nativeSymbol: "TRX",
  capabilities: [],
} as NetworkDescriptor;

/** records every URL asked for and answers from a table keyed on what the URL must contain. */
function transport(answer: (url: string) => string) {
  const urls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    return new Response(answer(url), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { urls, fetchImpl };
}

const api = (fetchImpl: typeof globalThis.fetch) => new SunPumpMarketApi(5_000, { fetchImpl });

describe("searchTokens", () => {
  // `keyword`, `symbol`, `name` and `search` are all accepted and ignored by this service; only
  // `query` filters. The fixture the fake serves differs between the two cases, so a wrong
  // parameter name comes back as the catalogue and this assertion fails.
  it("filters with `query`, and would return the whole catalogue with any other name", async () => {
    const { urls, fetchImpl } = transport((url) =>
      url.includes("query=Knight") ? KNIGHT : UNFILTERED,
    );
    const page = await api(fetchImpl).searchTokens(MAINNET, {
      keyword: "Knight",
      sort: "marketCap:DESC",
      pageNo: 1,
      pageSize: 3,
    });
    expect(page.tokens.map((token) => token.symbol)).toEqual(["Knight", "BabyKnight", "$KNIGHT"]);
    expect(page.tokens.map((token) => token.symbol)).not.toContain("SUNDOG");
    expect(urls[0]).toContain("/token/searchV2?");
    expect(urls[0]).toContain("query=Knight");
  });

  it("always uses searchV2, whose ordering does not change with the filters", async () => {
    const { urls, fetchImpl } = transport(() => KNIGHT);
    await api(fetchImpl).searchTokens(MAINNET, {
      keyword: "Knight",
      sort: "marketCap:DESC",
      pageNo: 1,
      pageSize: 3,
      onSunSwap: true,
    });
    expect(urls[0]).toContain("/token/searchV2?");
    expect(urls[0]).not.toContain("/token/search?");
  });

  // Verified live: each of these three narrows the result set, with these exact spellings.
  it("sends each filter under the name the service actually reads", async () => {
    const { urls, fetchImpl } = transport(() => KNIGHT);
    await api(fetchImpl).searchTokens(MAINNET, {
      keyword: "dog",
      sort: "marketCap:DESC",
      pageNo: 2,
      pageSize: 10,
      onSunSwap: true,
      twitterLaunch: true,
      sunAgentLaunch: true,
    });
    expect(urls[0]).toContain("onSunSwap=true");
    expect(urls[0]).toContain("filterTwitterLaunch=true");
    expect(urls[0]).toContain("filterSunAgentLaunch=true");
    expect(urls[0]).toContain("page=2");
    expect(urls[0]).toContain("size=10");
    expect(urls[0]).toContain("sort=marketCap");
  });

  it("leaves a filter out entirely rather than sending it as false", async () => {
    const { urls, fetchImpl } = transport(() => KNIGHT);
    await api(fetchImpl).searchTokens(MAINNET, {
      keyword: "dog",
      sort: "marketCap:DESC",
      pageNo: 1,
      pageSize: 10,
      onSunSwap: false,
    });
    expect(urls[0]).not.toContain("onSunSwap");
  });
});

describe("listTokens", () => {
  it("always sends an ordering, because the service's own default is a different listing", async () => {
    const { urls, fetchImpl } = transport(() => LIST);
    await api(fetchImpl).listTokens(MAINNET, {
      sort: "tokenCreatedInstant:DESC",
      pageNo: 1,
      pageSize: 2,
    });
    expect(urls[0]).toContain("/token?");
    expect(urls[0]).toContain("sort=tokenCreatedInstant");
  });

  it("filters by contract under the name the service reads", async () => {
    const { urls, fetchImpl } = transport(() => LIST);
    await api(fetchImpl).listTokens(MAINNET, {
      sort: "marketCap:DESC",
      contractAddress: "TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7",
      pageNo: 1,
      pageSize: 2,
    });
    expect(urls[0]).toContain("contractAddress=TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7");
  });

  it("publishes no total, because the service's is zero on every page", async () => {
    const { fetchImpl } = transport(() => LIST);
    const page = await api(fetchImpl).listTokens(MAINNET, {
      sort: "marketCap:DESC",
      pageNo: 1,
      pageSize: 2,
    });
    expect(page.tokens).toHaveLength(2);
    expect(page).not.toHaveProperty("total");
    // and the fixture really does claim zero while returning rows
    expect(JSON.parse(LIST).data.metadata.total).toBe(0);
  });
});

describe("tokensByOwner", () => {
  // `/token` accepts `ownerAddress` and ignores it, returning the whole catalogue; this endpoint
  // rejects `ownerAddress` and reads `address`. The fake answers the catalogue for anything else.
  it("asks by_owner with `address`", async () => {
    const { urls, fetchImpl } = transport((url) => (url.includes("address=T") ? BY_OWNER : LIST));
    const page = await api(fetchImpl).tokensByOwner(MAINNET, {
      owner: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
      pageNo: 1,
      pageSize: 5,
    });
    expect(urls[0]).toContain("/token/search/by_owner?");
    expect(urls[0]).toContain("address=TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj");
    expect(urls[0]).not.toContain("ownerAddress=");
    expect(page.tokens.map((token) => token.symbol)).toEqual(["SBT", "SBC", "PUSS"]);
  });

  // The endpoint answers tokenCreatedInstant:DESC whatever it is given. Sending a sort it drops
  // would be a request that implies a choice the caller does not have.
  it("sends no ordering, because the endpoint has none", async () => {
    const { urls, fetchImpl } = transport(() => BY_OWNER);
    await api(fetchImpl).tokensByOwner(MAINNET, {
      owner: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
      pageNo: 1,
      pageSize: 5,
    });
    expect(urls[0]).not.toContain("sort=");
  });
});

describe("getToken", () => {
  it("reads one token by contract address", async () => {
    const { urls, fetchImpl } = transport(() => PUSS);
    const token = await api(fetchImpl).getToken(MAINNET, "TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7");
    expect(urls[0]).toContain("/token/TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7");
    expect(token?.symbol).toBe("PUSS");
  });

  // An address the launchpad never indexed is answered with HTTP 200 and `code: 0`. Publishing
  // that as success would hand back a token object whose every field is null.
  it("answers null for the 200-with-no-token the service sends for an unknown address", async () => {
    const empty = '{"code":0,"msg":"SUCCESS","data":null}';
    const shell = '{"code":0,"msg":"SUCCESS","data":{"contractAddress":null,"symbol":null}}';
    for (const payload of [empty, shell]) {
      const { fetchImpl } = transport(() => payload);
      expect(
        await api(fetchImpl).getToken(MAINNET, "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj"),
      ).toBeNull();
    }
  });
});

describe("failures", () => {
  it("refuses a network with no SunPump catalogue rather than answering with mainnet's", async () => {
    const { urls, fetchImpl } = transport(() => LIST);
    await expect(
      api(fetchImpl).listTokens(NILE, { sort: "marketCap:DESC", pageNo: 1, pageSize: 2 }),
    ).rejects.toThrowError(CliError);
    expect(urls).toHaveLength(0);
  });

  it("treats a non-zero envelope code as the service refusing", async () => {
    const { fetchImpl } = transport(() => '{"code":4003,"msg":"Invalid param: rankingType"}');
    await expect(
      api(fetchImpl).listTokens(MAINNET, { sort: "marketCap:DESC", pageNo: 1, pageSize: 2 }),
    ).rejects.toMatchObject({ code: "provider_error" });
  });
});
