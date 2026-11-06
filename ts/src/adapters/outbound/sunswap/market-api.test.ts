import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isLosslessNumber } from "lossless-json";
import { SunApiClient } from "@sun-protocol/sun-sdk-api";
import { SunSwapMarketApi, type SunApiClientFactory } from "./market-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { expiringCheck } from "../http/__test-support__/dispatch.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const OK_BODY = JSON.stringify({ code: 0, msg: "SUCCESS", data: { list: [], meta: {} } });

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
  sunswap: { marketApiBaseUrl: "https://open.sun.io" },
} as NetworkDescriptor;

const query = { owner: "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N", pageNo: 1, pageSize: 10 };

// Inject below the deadline, size-cap, and 429 wrappers so they remain under test.
function apiServing(response: () => Promise<Response> | Response) {
  return new SunSwapMarketApi({
    fetchImpl: (async () => response()) as typeof globalThis.fetch,
  });
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("SunSwapMarketApi construction", () => {
  it("passes the scope's baseUrl, a fetch and the lossless parser to the client", async () => {
    const clientFactory = vi.fn<SunApiClientFactory>(
      (options) =>
        new SunApiClient({
          baseUrl: options.baseUrl,
          fetchImpl: async () => json(OK_BODY),
          jsonParser: options.jsonParser,
        }),
    );
    const nile = { ...MAINNET, id: "tron:3448148188" } as NetworkDescriptor;
    (nile as { sunswap?: unknown }).sunswap = { marketApiBaseUrl: "https://nile.example.test" };
    await new SunSwapMarketApi({ clientFactory }).listPositions(nile, query, NO_CHECK);
    const options = clientFactory.mock.calls[0]![0];
    expect(options.baseUrl).toBe("https://nile.example.test");
    expect(typeof options.fetchImpl).toBe("function");
    expect(isLosslessNumber(options.jsonParser("123") as never)).toBe(true);
  });

  it("sends the query the caller asked for, omitting what it did not set", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json(OK_BODY);
    }) as typeof globalThis.fetch;
    await new SunSwapMarketApi({ fetchImpl }).listPositions(
      MAINNET,
      {
        ...query,
        protocol: "V4",
      },
      NO_CHECK,
    );
    expect(url).toContain("userAddress=TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N");
    expect(url).toContain("protocol=V4");
    expect(url).not.toContain("poolAddress");
  });
});

describe("SunSwapMarketApi error mapping", () => {
  it("maps HTTP 429 to provider_rate_limited and carries Retry-After", async () => {
    const api = apiServing(
      () => new Response("slow down", { status: 429, headers: { "retry-after": "30" } }),
    );
    await expect(api.listPositions(MAINNET, query, NO_CHECK)).rejects.toMatchObject({
      code: "provider_rate_limited",
      details: { httpStatus: 429, retryAfterSeconds: 30 },
    });
  });

  it("still reports the rate limit when no Retry-After was sent", async () => {
    const api = apiServing(() => new Response("slow down", { status: 429 }));
    const error = await api.listPositions(MAINNET, query, NO_CHECK).catch((e) => e);
    expect(error.code).toBe("provider_rate_limited");
    expect(error.details).not.toHaveProperty("retryAfterSeconds");
  });

  it("maps another non-2xx to provider_error with the status and a short excerpt", async () => {
    const api = apiServing(() => new Response("upstream exploded", { status: 503 }));
    const error = await api.listPositions(MAINNET, query, NO_CHECK).catch((e) => e);
    expect(error.code).toBe("provider_error");
    expect(error.details.httpStatus).toBe(503);
    expect(error.message).not.toContain("exploded");
  });

  it("never lets a long body into the message, and caps it in the details", async () => {
    const api = apiServing(() => new Response("x".repeat(5_000), { status: 500 }));
    const error = await api.listPositions(MAINNET, query, NO_CHECK).catch((e) => e);
    expect(error.message).toBe("SunSwap market API request failed");
    expect(String(error.details.body).length).toBeLessThanOrEqual(201);
  });

  it("maps a non-JSON body to provider_error", async () => {
    const api = apiServing(() => json("<html>nope</html>"));
    await expect(api.listPositions(MAINNET, query, NO_CHECK)).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  it("maps a non-zero envelope code to provider_error", async () => {
    const api = apiServing(() => json({ code: 4003, msg: "size too large", data: null }));
    await expect(api.listPositions(MAINNET, query, NO_CHECK)).rejects.toMatchObject({
      code: "provider_error",
      details: { apiCode: 4003, apiMessage: "size too large" },
    });
  });

  it("maps an unexpected shape to provider_error", async () => {
    const api = apiServing(() => json({ code: 0, data: { list: "not an array" } }));
    await expect(api.listPositions(MAINNET, query, NO_CHECK)).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  it("surfaces a timeout as timeout, not as a provider failure", async () => {
    const stalling = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      })) as typeof globalThis.fetch;
    const api = new SunSwapMarketApi({ fetchImpl: stalling });
    await expect(api.listPositions(MAINNET, query, expiringCheck(20))).rejects.toMatchObject({
      code: "timeout",
    });
  });
});

describe("SunSwapMarketApi paging", () => {
  it("reports the server's own hasMore rather than inferring it", async () => {
    const full = apiServing(() =>
      json({ code: 0, data: { list: [], meta: { hasMore: true, returnSize: 0 } } }),
    );
    await expect(full.listPositions(MAINNET, query, NO_CHECK)).resolves.toMatchObject({
      hasMore: true,
    });
    const last = apiServing(() => json({ code: 0, data: { list: [], meta: { hasMore: false } } }));
    await expect(last.listPositions(MAINNET, query, NO_CHECK)).resolves.toMatchObject({
      hasMore: false,
    });
  });

  it("omits hasMore when the server did not say", async () => {
    const api = apiServing(() => json({ code: 0, data: { list: [] } }));
    await expect(api.listPositions(MAINNET, query, NO_CHECK)).resolves.not.toHaveProperty(
      "hasMore",
    );
  });
});

describe("SunSwapMarketApi.prices", () => {
  const PRICE_BODY = readFileSync(
    fileURLToPath(new URL("./__fixtures__/price.json", import.meta.url)),
    "utf8",
  );

  it("reads the address-keyed object the service answers with", async () => {
    const api = apiServing(() => json(PRICE_BODY));
    const prices = await api.prices(
      MAINNET,
      ["TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"],
      NO_CHECK,
    );
    expect(prices).toEqual([
      {
        address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        priceUsd: "0.999981077667",
        quotedAt: "2026-09-23 08:09",
      },
      {
        address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        priceUsd: "0.343701904777",
        quotedAt: "2026-09-23 08:09",
      },
    ]);
  });

  it("sends the addresses comma-joined and asks nothing when given none", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json({ code: 0, data: {} });
    }) as typeof globalThis.fetch;
    const api = new SunSwapMarketApi({ fetchImpl });
    await api.prices(MAINNET, ["TA", "TB"], NO_CHECK);
    expect(decodeURIComponent(url)).toContain("tokenAddress=TA,TB");
    url = "";
    await expect(api.prices(MAINNET, [], NO_CHECK)).resolves.toEqual([]);
    expect(url).toBe("");
  });

  it("carries a zero price through rather than dropping the row", async () => {
    const api = apiServing(() =>
      json({ code: 0, data: { TX: { quote: { USD: { last_updated: 0, price: "0" } } } } }),
    );
    await expect(api.prices(MAINNET, ["TX"], NO_CHECK)).resolves.toEqual([
      { address: "TX", priceUsd: "0", quotedAt: "1970-01-01 00:00" },
    ]);
  });

  it("expands an exponent-form price", async () => {
    const api = apiServing(() =>
      json({ code: 0, data: { TX: { quote: { USD: { price: "7.06e-05" } } } } }),
    );
    expect((await api.prices(MAINNET, ["TX"], NO_CHECK))[0]?.priceUsd).toBe("0.0000706");
  });
});

describe("SunSwapMarketApi.symbols", () => {
  it("builds an address-to-symbol map from the catalogue", async () => {
    const body = readFileSync(
      fileURLToPath(new URL("./__fixtures__/tokens.json", import.meta.url)),
      "utf8",
    );
    const api = apiServing(() => json(body));
    const symbols = await api.symbols(MAINNET, ["T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"], NO_CHECK);
    expect(symbols.get("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb")).toBe("TRX");
  });

  it("asks for every address at once, across all protocols", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json({ code: 0, data: { list: [] } });
    }) as typeof globalThis.fetch;
    await new SunSwapMarketApi({ fetchImpl }).symbols(MAINNET, ["TA", "TB"], NO_CHECK);
    expect(decodeURIComponent(url)).toContain("tokenAddress=TA,TB");
    expect(url).toContain("protocol=ALL");
  });

  it("omits an address the catalogue does not know", async () => {
    const api = apiServing(() => json({ code: 0, data: { list: [{ tokenAddress: "TA" }] } }));
    await expect(api.symbols(MAINNET, ["TA"], NO_CHECK)).resolves.toEqual(new Map());
  });
});

describe("SunSwapMarketApi token endpoints", () => {
  const TOKENS_BODY = readFileSync(
    fileURLToPath(new URL("./__fixtures__/tokens.json", import.meta.url)),
    "utf8",
  );

  it("maps a page of tokens and reports the server's hasMore", async () => {
    const api = apiServing(() => json(TOKENS_BODY));
    const page = await api.listTokens(
      MAINNET,
      { protocol: "ALL", pageNo: 1, pageSize: 3 },
      NO_CHECK,
    );
    expect(page.tokens).toHaveLength(3);
    expect(page.tokens[0]?.symbol).toBe("TRX");
    expect(page.hasMore).toBe(true);
  });

  // Records have no blacklist marker to identify impersonations in unfiltered results.
  it("always asks the service to filter the blacklist", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json(TOKENS_BODY);
    }) as typeof globalThis.fetch;
    const api = new SunSwapMarketApi({ fetchImpl });
    await api.listTokens(MAINNET, { protocol: "ALL", pageNo: 1, pageSize: 3 }, NO_CHECK);
    expect(url).toContain("filterBlackList=true");
    url = "";
    await api.searchTokens(
      MAINNET,
      { keyword: "USDT", protocol: "ALL", pageNo: 1, pageSize: 3 },
      NO_CHECK,
    );
    expect(url).toContain("filterBlackList=true");
  });

  // Omitting protocol can mix statistic scopes and duplicate tokens.
  it("always sends the protocol scope explicitly", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json(TOKENS_BODY);
    }) as typeof globalThis.fetch;
    await new SunSwapMarketApi({ fetchImpl }).listTokens(
      MAINNET,
      {
        protocol: "ALL",
        pageNo: 1,
        pageSize: 3,
      },
      NO_CHECK,
    );
    expect(url).toContain("protocol=ALL");
  });

  it("sends the search keyword as query, and omits what was not set", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json(TOKENS_BODY);
    }) as typeof globalThis.fetch;
    await new SunSwapMarketApi({ fetchImpl }).searchTokens(
      MAINNET,
      {
        keyword: "USDT",
        protocol: "V3",
        pageNo: 2,
        pageSize: 5,
      },
      NO_CHECK,
    );
    expect(url).toContain("query=USDT");
    expect(url).toContain("pageNo=2");
    expect(url).not.toContain("sort=");
  });

  it("passes --address through as a token filter when given", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json(TOKENS_BODY);
    }) as typeof globalThis.fetch;
    await new SunSwapMarketApi({ fetchImpl }).listTokens(
      MAINNET,
      {
        protocol: "ALL",
        pageNo: 1,
        pageSize: 3,
        address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      },
      NO_CHECK,
    );
    expect(url).toContain("tokenAddress=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  });
});

describe("SunSwapMarketApi pool endpoints", () => {
  const POOLS_BODY = readFileSync(
    fileURLToPath(new URL("./__fixtures__/pools.json", import.meta.url)),
    "utf8",
  );
  const poolQuery = { desc: true, pageNo: 1, pageSize: 3 };

  it("maps a page of pools", async () => {
    const api = apiServing(() => json(POOLS_BODY));
    const page = await api.listPools(MAINNET, poolQuery, NO_CHECK);
    expect(page.pools).toHaveLength(3);
    expect(page.pools[0]?.poolAddress).toBe("TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx");
    expect(page.hasMore).toBe(true);
  });

  it("sends the sort direction, the scope filter and the blacklist filter", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return json(POOLS_BODY);
    }) as typeof globalThis.fetch;
    await new SunSwapMarketApi({ fetchImpl }).listPools(
      MAINNET,
      {
        ...poolQuery,
        desc: false,
        protocol: "V3",
        sort: "totalApr",
        token: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      },
      NO_CHECK,
    );
    expect(url).toContain("desc=false");
    expect(url).toContain("protocol=V3");
    expect(url).toContain("sort=totalApr");
    expect(url).toContain("tokenAddress=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    expect(url).toContain("filterBlackList=true");
  });

  it("asks the count with the same filters as the page it describes", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: unknown) => {
      urls.push(String(input));
      return json(urls.length === 1 ? POOLS_BODY : { code: 0, data: 81 });
    }) as typeof globalThis.fetch;
    const api = new SunSwapMarketApi({ fetchImpl });
    const filters = { keyword: "TRX USDT", protocol: "V3", pageNo: 1, pageSize: 3 };
    await api.searchPools(MAINNET, filters, NO_CHECK);
    await api.countPools(MAINNET, filters, NO_CHECK);
    const [page, count] = urls.map((u) => new URL(u));
    expect(page?.pathname).toBe("/apiv2/pools/search");
    expect(count?.pathname).toBe("/apiv2/pools/search/count");
    for (const key of ["query", "protocol", "filterBlackList", "pageNo", "pageSize"]) {
      expect(count?.searchParams.get(key)).toBe(page?.searchParams.get(key));
    }
  });

  it("reads the bare number the count endpoint answers with", async () => {
    const api = apiServing(() => json({ code: 0, data: 81 }));
    await expect(
      api.countPools(MAINNET, { keyword: "TRX", pageNo: 1, pageSize: 3 }, NO_CHECK),
    ).resolves.toBe(81);
  });

  it("answers null rather than a wrong total when the count is unreadable", async () => {
    const api = apiServing(() => json({ code: 0, data: "not a number" }));
    await expect(
      api.countPools(MAINNET, { keyword: "TRX", pageNo: 1, pageSize: 3 }, NO_CHECK),
    ).resolves.toBeNull();
  });
});
