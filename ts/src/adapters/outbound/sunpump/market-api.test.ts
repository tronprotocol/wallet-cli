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

const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  nativeSymbol: "TRX",
  capabilities: [],
} as NetworkDescriptor;

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
    expect(JSON.parse(LIST).data.metadata.total).toBe(0);
  });
});

describe("tokensByOwner", () => {
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
