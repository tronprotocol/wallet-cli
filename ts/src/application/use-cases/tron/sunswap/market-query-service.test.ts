import { describe, expect, it } from "vitest";
import { SunSwapMarketQueryService } from "./market-query-service.js";
import type { MarketDataPort, PriceRecord } from "../../../ports/sunswap/market-data.js";
import type { TokenRepository } from "../../../ports/token-repository.js";
import type { NetworkDescriptor, TokenEntry } from "../../../../domain/types/index.js";

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
} as NetworkDescriptor;

const ALIASES = { tron: "tron:728126428", nile: "tron:3448148188" };

/** a scope for calls whose warnings the test does not read. */
const SILENT = { warn: () => undefined };

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const WTRX_MAINNET = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";

const officialBook: TokenEntry[] = [
  { kind: "trc20", id: USDT, symbol: "USDT", decimals: 6, name: "Tether USD" },
];

function service(
  options: {
    prices?: (addresses: readonly string[]) => Promise<PriceRecord[]>;
    symbols?: () => Promise<Map<string, string>>;
    official?: TokenEntry[];
    tokens?: () => Promise<{ tokens: unknown[]; hasMore?: boolean }>;
    pools?: () => Promise<{ pools: unknown[]; hasMore?: boolean }>;
    positions?: () => Promise<{ positions: unknown[]; hasMore?: boolean }>;
    total?: number | null;
  } = {},
) {
  const asked: string[][] = [];
  const tokenQueries: Record<string, unknown>[] = [];
  const poolQueries: Record<string, unknown>[] = [];
  const positionQueries: Record<string, unknown>[] = [];
  const countQueries: Record<string, unknown>[] = [];
  const market = {
    listPositions: async (_net: NetworkDescriptor, q: Record<string, unknown>) => {
      positionQueries.push(q);
      return options.positions ? options.positions() : { positions: [] };
    },
    listPools: async (_net: NetworkDescriptor, q: Record<string, unknown>) => {
      poolQueries.push(q);
      return options.pools ? options.pools() : { pools: [] };
    },
    searchPools: async (_net: NetworkDescriptor, q: Record<string, unknown>) => {
      poolQueries.push(q);
      return options.pools ? options.pools() : { pools: [] };
    },
    countPools: async (_net: NetworkDescriptor, q: Record<string, unknown>) => {
      countQueries.push(q);
      return options.total ?? null;
    },
    listTokens: async (_net: NetworkDescriptor, q: Record<string, unknown>) => {
      tokenQueries.push(q);
      return options.tokens ? options.tokens() : { tokens: [] };
    },
    searchTokens: async (_net: NetworkDescriptor, q: Record<string, unknown>) => {
      tokenQueries.push(q);
      return options.tokens ? options.tokens() : { tokens: [] };
    },
    prices: async (_net: NetworkDescriptor, addresses: readonly string[]) => {
      asked.push([...addresses]);
      return options.prices
        ? options.prices(addresses)
        : addresses.map((address) => ({ address, priceUsd: "1", quotedAt: "2026-09-23 08:09" }));
    },
    symbols: async () => (options.symbols ? options.symbols() : new Map()),
  } as unknown as MarketDataPort;
  const tokens = {
    official: () => options.official ?? officialBook,
    effective: () => [],
    add: () => "added" as const,
    remove: () => officialBook[0]!,
  } satisfies TokenRepository;
  return {
    service: new SunSwapMarketQueryService(market, tokens, ALIASES),
    asked,
    tokenQueries,
    poolQueries,
    countQueries,
    positionQueries,
  };
}

describe("symbol resolution", () => {
  it("resolves TRX and WTRX without consulting the book", async () => {
    const { service: s, asked } = service({ official: [] });
    await s.prices(MAINNET, { token: "trx" });
    await s.prices(MAINNET, { token: "WTRX" });
    expect(asked).toEqual([[TRX], [WTRX_MAINNET]]);
  });

  it("resolves an official book symbol, case-insensitively", async () => {
    const { service: s, asked } = service();
    await s.prices(MAINNET, { token: "usdt" });
    expect(asked[0]).toEqual([USDT]);
  });

  /**
   * The user layer of the book is keyed per account and this command takes none, so a symbol
   * added with `token add` cannot resolve here. The refusal must therefore NOT suggest
   * `token add` — telling someone to do something that will not work is worse than being brief.
   */
  it("refuses an unknown symbol without suggesting token add", async () => {
    const { service: s } = service();
    const error = await s.prices(MAINNET, { token: "WIN" }).catch((e) => e);
    expect(error.code).toBe("unsupported_token");
    expect(error.message).toBe(
      "unknown token symbol WIN on tron; pass its contract address with --address",
    );
    expect(error.message).not.toContain("token add");
  });

  // pool-list has no --address; its refusal names the flag it does have.
  it("tells pool-list --token to pass the address with --token", async () => {
    const { service: s } = service();
    await expect(
      s.poolList(SILENT, MAINNET, {
        orderBy: "tvl",
        sort: "desc",
        limit: 10,
        offset: 0,
        token: "WIN",
      }),
    ).rejects.toThrow("unknown token symbol WIN on tron; pass its contract address with --token");
  });

  it("names the network the way a person types it", async () => {
    const nile = { ...MAINNET, id: "tron:3448148188" } as NetworkDescriptor;
    const { service: s } = service({ official: [] });
    await expect(s.prices(nile, { token: "WIN" })).rejects.toThrow(/on nile;/);
  });

  // WTRX has no known Nile-or-elsewhere deployment beyond the two we ship; inventing one would
  // point a user at an address nobody has verified.
  it("refuses WTRX on a network with no known deployment", async () => {
    const other = { ...MAINNET, id: "tron:2494104990" } as NetworkDescriptor;
    const { service: s } = service({ official: [] });
    await expect(s.prices(other, { token: "WTRX" })).rejects.toMatchObject({
      code: "unsupported_token",
    });
  });
});

describe("input shape", () => {
  it("requires one of the symbol or --address", async () => {
    const { service: s } = service();
    await expect(s.prices(MAINNET, {})).rejects.toMatchObject({ code: "missing_option" });
  });

  // Taking one silently would answer a question the caller did not ask.
  it("refuses both at once", async () => {
    const { service: s } = service();
    await expect(s.prices(MAINNET, { token: "TRX", addresses: [USDT] })).rejects.toMatchObject({
      code: "invalid_option",
    });
  });

  it("rejects an address that is not a TRON address", async () => {
    const { service: s } = service();
    await expect(s.prices(MAINNET, { addresses: [USDT, "0xdead"] })).rejects.toMatchObject({
      code: "invalid_address",
    });
  });

  it("deduplicates addresses while keeping the order given", async () => {
    const { service: s, asked } = service();
    await s.prices(MAINNET, { addresses: [USDT, TRX, USDT] });
    expect(asked[0]).toEqual([USDT, TRX]);
  });
});

describe("symbol column", () => {
  it("looks up only the addresses the service actually quoted", async () => {
    const { service: s } = service({
      prices: async () => [{ address: TRX, priceUsd: "0.34", quotedAt: "2026-09-23 08:09" }],
      symbols: async () => new Map([[TRX, "TRX"]]),
    });
    const view = await s.prices(MAINNET, { addresses: [TRX, USDT] });
    expect([...view.symbols.keys()]).toEqual([TRX]);
    expect(view.warnings).toEqual([]);
  });

  // The column is decoration; losing it must not lose the prices the caller asked for.
  it("degrades to a warning and still succeeds when the catalogue fails", async () => {
    const { service: s } = service({
      symbols: async () => {
        throw new Error("catalogue down");
      },
    });
    const view = await s.prices(MAINNET, { addresses: [USDT] });
    expect(view.prices).toHaveLength(1);
    expect(view.symbols.size).toBe(0);
    expect(view.warnings).toHaveLength(1);
    expect(view.warnings[0]).toContain("Symbol");
  });

  // "0" is a real answer for an address the service never indexed, not a failure.
  it("passes a zero price through", async () => {
    const { service: s } = service({
      prices: async () => [{ address: USDT, priceUsd: "0", quotedAt: "2026-09-23 08:09" }],
    });
    const view = await s.prices(MAINNET, { addresses: [USDT] });
    expect(view.prices[0]?.priceUsd).toBe("0");
  });
});

const listQuery = { protocol: "ALL", orderBy: "tvl", limit: 20, offset: 0 };

describe("token-list", () => {
  it("translates the CLI's window and vocabulary into the service's", async () => {
    const { service: s, tokenQueries } = service();
    await s.tokenList(MAINNET, { ...listQuery, limit: 10, offset: 20, orderBy: "volume-24h" });
    expect(tokenQueries[0]).toMatchObject({
      protocol: "ALL",
      sort: "volumeUsd1d",
      pageNo: 3,
      pageSize: 10,
    });
  });

  it("normalises the protocol scope before sending it", async () => {
    const { service: s, tokenQueries } = service();
    await s.tokenList(MAINNET, { ...listQuery, protocol: "v1_5" });
    expect(tokenQueries[0]?.protocol).toBe("V1_5");
  });

  // The service has a sort FIELD but no direction parameter, so the echo reports the constant it
  // is rather than a choice the caller could have made.
  it("echoes the ordering with sort fixed at desc", async () => {
    const { service: s } = service();
    const view = await s.tokenList(MAINNET, listQuery);
    expect(view.query).toEqual({ orderBy: "tvl", sort: "desc" });
  });

  // The service does not count; obtaining a total would mean fetching every record.
  it("reports the window with a null total", async () => {
    const { service: s } = service({ tokens: async () => ({ tokens: [], hasMore: true }) });
    const view = await s.tokenList(MAINNET, { ...listQuery, limit: 5, offset: 10 });
    expect(view.pagination).toEqual({ offset: 10, limit: 5, total: null, hasMore: true });
  });

  it("refuses a window no page boundary contains", async () => {
    const { service: s } = service();
    await expect(s.tokenList(MAINNET, { ...listQuery, limit: 4, offset: 5 })).rejects.toMatchObject(
      { code: "invalid_value" },
    );
  });

  it("validates --address before asking anyone", async () => {
    const { service: s, tokenQueries } = service();
    await expect(s.tokenList(MAINNET, { ...listQuery, address: "0xdead" })).rejects.toMatchObject({
      code: "invalid_address",
    });
    expect(tokenQueries).toHaveLength(0);
  });
});

describe("token-search", () => {
  it("passes the trimmed keyword and the scope", async () => {
    const { service: s, tokenQueries } = service();
    await s.tokenSearch(MAINNET, { keyword: "  USDT  ", protocol: "ALL", limit: 20, offset: 0 });
    expect(tokenQueries[0]).toMatchObject({ keyword: "USDT", protocol: "ALL", pageNo: 1 });
  });

  // An empty keyword reaches the service as "no filter" and returns the whole catalogue, which
  // is a different question from the one that was asked.
  it("refuses an empty or whitespace keyword", async () => {
    const { service: s } = service();
    for (const keyword of ["", "   "]) {
      await expect(
        s.tokenSearch(MAINNET, { keyword, protocol: "ALL", limit: 20, offset: 0 }),
      ).rejects.toMatchObject({ code: "invalid_value" });
    }
  });

  // Search takes no sort flag, so echoing an ordering would read as one the caller could change.
  it("reports no query echo", async () => {
    const { service: s } = service();
    const view = await s.tokenSearch(MAINNET, {
      keyword: "USDT",
      protocol: "ALL",
      limit: 20,
      offset: 0,
    });
    expect(view.query).toBeUndefined();
    expect(view.pagination).toEqual({ offset: 0, limit: 20, total: null });
  });
});

const WTRX = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";
const V4_ID = "dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e";
const poolQuery = { orderBy: "tvl", sort: "desc", limit: 20, offset: 0 };
const onePool = (over: Record<string, unknown> = {}) => ({
  poolAddress: "TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx",
  protocol: "V3",
  tokens: [{ address: WTRX }, { address: USDT }],
  rates: ["2.909173910769221638008798715979251686941"],
  ...over,
});

describe("pool-list", () => {
  it("translates the ordering and the direction the service understands", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(SILENT, MAINNET, { ...poolQuery, orderBy: "fees-24h", sort: "asc" });
    expect(poolQueries[0]).toMatchObject({ sort: "feeUsd1d", desc: false, pageNo: 1 });
  });

  it("accepts every ordering the pool endpoint has, and no others", async () => {
    const { service: s } = service();
    for (const orderBy of ["tvl", "volume-24h", "fees-24h", "apr"]) {
      await expect(s.poolList(SILENT, MAINNET, { ...poolQuery, orderBy })).resolves.toBeDefined();
    }
    await expect(
      s.poolList(SILENT, MAINNET, { ...poolQuery, orderBy: "nope" }),
    ).rejects.toMatchObject({
      code: "invalid_value",
    });
    await expect(
      s.poolList(SILENT, MAINNET, { ...poolQuery, sort: "sideways" }),
    ).rejects.toMatchObject({
      code: "invalid_value",
    });
  });

  // The service will not match a pool id that still carries its 0x prefix.
  it("strips the 0x from a V4 pool id and leaves an address alone", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(SILENT, MAINNET, { ...poolQuery, pool: `0x${V4_ID}` });
    expect(poolQueries[0]?.pool).toBe(V4_ID);
    await s.poolList(SILENT, MAINNET, { ...poolQuery, pool: "TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx" });
    expect(poolQueries[1]?.pool).toBe("TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx");
  });

  it("resolves --token from a symbol, and passes an address straight through", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(SILENT, MAINNET, { ...poolQuery, token: "USDT" });
    expect(poolQueries[0]?.token).toBe(USDT);
    await s.poolList(SILENT, MAINNET, { ...poolQuery, token: WTRX });
    expect(poolQueries[1]?.token).toBe(WTRX);
  });

  // TRX matches native-TRX pools; swapping it for WTRX here would answer about other pools.
  it("does not swap TRX for WTRX", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(SILENT, MAINNET, { ...poolQuery, token: "TRX" });
    expect(poolQueries[0]?.token).toBe(TRX);
  });

  it("quotes every pool in the chosen token and never publishes the raw rates", async () => {
    const { service: s } = service({ pools: async () => ({ pools: [onePool()] }) });
    const view = await s.poolList(SILENT, MAINNET, { ...poolQuery, token: "USDT" });
    expect(view.pools[0]).not.toHaveProperty("rates");
    expect(view.pools[0]?.pairPrices).toEqual([
      { base: WTRX, quote: USDT, price: "0.343740192464323181" },
    ]);
    expect(view.view).toEqual({ quoteSymbol: "USDT" });
  });

  // Without a token to quote in there is no price to give, and no heading to name.
  it("omits pairPrices and the quote heading without --token", async () => {
    const { service: s } = service({ pools: async () => ({ pools: [onePool()] }) });
    const view = await s.poolList(SILENT, MAINNET, poolQuery);
    expect(view.pools[0]).not.toHaveProperty("pairPrices");
    expect(view.pools[0]).not.toHaveProperty("rates");
    expect(view.view).toBeUndefined();
  });
});

describe("pool-search", () => {
  // "showing 3 of 76" has to be 76 of the SAME set, or the sentence is a lie about which 76.
  it("asks for the count under the same filters as the page", async () => {
    const { service: s, poolQueries, countQueries } = service({ total: 81 });
    const view = await s.poolSearch(MAINNET, {
      keyword: "TRX USDT",
      protocol: "v3",
      limit: 3,
      offset: 0,
    });
    expect(countQueries[0]).toEqual(poolQueries[0]);
    expect(view.pagination.total).toBe(81);
  });

  it("reports a null total rather than a wrong one when the count fails", async () => {
    const { service: s } = service({ total: null });
    const view = await s.poolSearch(MAINNET, { keyword: "TRX", limit: 3, offset: 0 });
    expect(view.pagination.total).toBeNull();
  });

  it("has no ordering flag, so it echoes no ordering", async () => {
    const { service: s } = service({ total: 1 });
    const view = await s.poolSearch(MAINNET, { keyword: "TRX", limit: 3, offset: 0 });
    expect(view.query).toBeUndefined();
  });

  it("strips the 0x from a pool id used as the keyword", async () => {
    const { service: s, poolQueries } = service();
    await s.poolSearch(MAINNET, { keyword: `0x${V4_ID}`, limit: 3, offset: 0 });
    expect(poolQueries[0]?.keyword).toBe(V4_ID);
  });

  it("refuses an empty or whitespace keyword", async () => {
    const { service: s } = service();
    for (const keyword of ["", "  "]) {
      await expect(s.poolSearch(MAINNET, { keyword, limit: 3, offset: 0 })).rejects.toMatchObject({
        code: "invalid_value",
      });
    }
  });
});

const OWNER = "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N";

describe("position-list", () => {
  it("passes the owner, window and filters the service understands", async () => {
    const { service: s, positionQueries } = service();
    await s.positionList(MAINNET, {
      owner: OWNER,
      pool: `0x${V4_ID}`,
      protocol: "v4",
      limit: 4,
      offset: 8,
    });
    expect(positionQueries[0]).toEqual({
      owner: OWNER,
      pool: V4_ID,
      protocol: "V4",
      pageNo: 3,
      pageSize: 4,
    });
  });

  // A listing that silently answered about whichever account happened to be active would be a
  // different question from the one asked; this command takes no account at all.
  it("validates the owner rather than falling back to anything", async () => {
    const { service: s, positionQueries } = service();
    await expect(
      s.positionList(MAINNET, { owner: "0xdead", limit: 20, offset: 0 }),
    ).rejects.toMatchObject({ code: "invalid_address" });
    expect(positionQueries).toHaveLength(0);
  });

  // The server sorts by LP value and takes no ordering parameter, so there is nothing to echo.
  it("reports the window and no ordering", async () => {
    const { service: s } = service({ positions: async () => ({ positions: [], hasMore: true }) });
    const view = await s.positionList(MAINNET, { owner: OWNER, limit: 4, offset: 8 });
    expect(view.pagination).toEqual({ offset: 8, limit: 4, total: null, hasMore: true });
    expect(view).not.toHaveProperty("query");
  });

  it("refuses a window no page boundary contains", async () => {
    const { service: s } = service();
    await expect(
      s.positionList(MAINNET, { owner: OWNER, limit: 4, offset: 5 }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });
});

/**
 * The SunSwap market service exposes only the first 1000 rows of any ordering and answers a page
 * past them with code 4003. A window that ends past row 1000 can never be served, so it is refused
 * locally as a usage error before anything is asked.
 */
describe("the 1000-row window", () => {
  const past = { limit: 20, offset: 1000 };
  const refusal = {
    code: "invalid_value",
    message: expect.stringContaining("only the first 1000 rows of each ordering"),
  };

  it("pool-list refuses it, with or without --min-tvl", async () => {
    const { service: s, poolQueries } = service();
    await expect(s.poolList(SILENT, MAINNET, { ...poolQuery, ...past })).rejects.toMatchObject(
      refusal,
    );
    await expect(
      s.poolList(SILENT, MAINNET, { ...poolQuery, ...past, minTvl: "100000" }),
    ).rejects.toMatchObject(refusal);
    expect(poolQueries).toHaveLength(0);
  });

  it("pool-search refuses it", async () => {
    const { service: s, poolQueries, countQueries } = service();
    await expect(s.poolSearch(MAINNET, { keyword: "TRX", ...past })).rejects.toMatchObject(refusal);
    expect(poolQueries).toHaveLength(0);
    expect(countQueries).toHaveLength(0);
  });

  it("token-list refuses it", async () => {
    const { service: s, tokenQueries } = service();
    await expect(
      s.tokenList(MAINNET, { protocol: "ALL", orderBy: "tvl", ...past }),
    ).rejects.toMatchObject(refusal);
    expect(tokenQueries).toHaveLength(0);
  });

  it("token-search refuses it", async () => {
    const { service: s, tokenQueries } = service();
    await expect(
      s.tokenSearch(MAINNET, { keyword: "USDT", protocol: "ALL", ...past }),
    ).rejects.toMatchObject(refusal);
    expect(tokenQueries).toHaveLength(0);
  });

  it("position-list refuses it", async () => {
    const { service: s, positionQueries } = service();
    await expect(s.positionList(MAINNET, { owner: OWNER, ...past })).rejects.toMatchObject(refusal);
    expect(positionQueries).toHaveLength(0);
  });

  it("serves the last window that fits", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(SILENT, MAINNET, { ...poolQuery, limit: 20, offset: 980 });
    expect(poolQueries[0]).toMatchObject({ pageNo: 50, pageSize: 20 });
  });
});

/**
 * `--min-tvl`, filtered before it is paged.
 *
 * The fake market serves pages of an in-memory universe in whichever order is asked, and fails a
 * page past row 1000 the way the service does — so a scan that overruns the window fails the test
 * rather than passing quietly.
 */
type FakePool = {
  poolAddress: string;
  reserveUsd: string;
  volumeUsd1d: string;
  feeUsd1d: string;
  totalApr: string;
  tokens: { address: string }[];
  rates: string[];
};

const fakePool = (index: number, reserveUsd: string, totalApr = "0"): FakePool => ({
  poolAddress: `TPool${String(index).padStart(5, "0")}`,
  reserveUsd,
  volumeUsd1d: "0",
  feeUsd1d: "0",
  totalApr,
  tokens: [{ address: WTRX }, { address: USDT }],
  rates: ["1"],
});

function scanService(universe: readonly FakePool[]) {
  const queries: { sort: string; desc: boolean; pageNo: number; pageSize: number }[] = [];
  const warnings: unknown[] = [];
  const market = {
    listPools: async (
      _net: NetworkDescriptor,
      q: { sort: keyof FakePool; desc: boolean; pageNo: number; pageSize: number },
    ) => {
      queries.push({ sort: q.sort, desc: q.desc, pageNo: q.pageNo, pageSize: q.pageSize });
      if (q.pageNo * q.pageSize > 1000) {
        throw new Error("code 4003: Invalid param: total size exceeds");
      }
      // Number is precise enough for the fake's own values; the service under test never uses it.
      const ordered = [...universe].sort((a, b) => {
        const diff = Number(a[q.sort]) - Number(b[q.sort]);
        return q.desc ? -diff : diff;
      });
      const start = (q.pageNo - 1) * q.pageSize;
      return {
        pools: ordered.slice(start, start + q.pageSize),
        hasMore: start + q.pageSize < ordered.length,
      };
    },
  } as unknown as MarketDataPort;
  const tokens = {
    official: () => officialBook,
    effective: () => [],
    add: () => "added" as const,
    remove: () => officialBook[0]!,
  } satisfies TokenRepository;
  const scope = { warn: (warning: unknown) => void warnings.push(warning) };
  return {
    list: (query: Partial<typeof poolQuery> & { minTvl?: string }) =>
      new SunSwapMarketQueryService(market, tokens, ALIASES).poolList(scope, MAINNET, {
        ...poolQuery,
        ...query,
      }),
    queries,
    warnings,
  };
}

const addresses = (view: { pools: readonly { poolAddress: string }[] }) =>
  view.pools.map((pool) => pool.poolAddress);

describe("pool-list --min-tvl", () => {
  // 250 pools with TVL 250000 down to 1000; 150 of them are at 101000 or above.
  const ladder = Array.from({ length: 250 }, (_, i) => fakePool(i, String((250 - i) * 1000)));

  it("in the default order, stops at the first pool below the threshold", async () => {
    const { list, queries } = scanService(ladder);
    const view = await list({ minTvl: "101000", limit: 100, offset: 100 });
    expect(addresses(view)).toEqual(ladder.slice(100, 150).map((pool) => pool.poolAddress));
    expect(view.pagination).toEqual({ offset: 100, limit: 100, total: null, hasMore: false });
    // page 2 holds the first pool below the threshold, so page 3 is never asked for
    expect(queries).toEqual([
      { sort: "reserveUsd", desc: true, pageNo: 1, pageSize: 100 },
      { sort: "reserveUsd", desc: true, pageNo: 2, pageSize: 100 },
    ]);
  });

  it("windows the qualifying pools, not the raw rows", async () => {
    const { list, queries } = scanService(ladder);
    const view = await list({ minTvl: "101000", limit: 20, offset: 40 });
    expect(addresses(view)).toEqual(ladder.slice(40, 60).map((pool) => pool.poolAddress));
    expect(view.pagination).toEqual({ offset: 40, limit: 20, total: null, hasMore: true });
    expect(view.query).toEqual({ orderBy: "tvl", sort: "desc" });
    expect(queries).toHaveLength(1);
  });

  /**
   * A window that ends exactly on a page boundary must not report "no more" merely because the
   * scan stopped there: a caller who pages until hasMore is false would miss the rest.
   */
  it("reads past a full window to learn whether there is more", async () => {
    const { list, queries } = scanService(ladder);
    const view = await list({ minTvl: "101000", limit: 100, offset: 0 });
    expect(view.pools).toHaveLength(100);
    expect(view.pagination.hasMore).toBe(true);
    expect(queries).toHaveLength(2);
  });

  it("drops a pool with no TVL", async () => {
    const pools = [fakePool(0, "300000"), fakePool(1, ""), fakePool(2, "200000")];
    const { list } = scanService(pools);
    const view = await list({ minTvl: "100000" });
    expect(addresses(view)).toEqual(["TPool00000", "TPool00002"]);
  });

  it("orders by apr from the first attempt when the window fills", async () => {
    // a tiny pool on top, then qualifying pools among non-qualifying ones
    const pools = [
      fakePool(0, "10", "500"),
      fakePool(1, "150000", "2"),
      fakePool(2, "50", "1.5"),
      fakePool(3, "120000", "1"),
      fakePool(4, "200000", "0.5"),
      fakePool(5, "900000", "0.1"),
    ];
    const { list, queries, warnings } = scanService(pools);
    const view = await list({ orderBy: "apr", minTvl: "100000", limit: 3 });
    expect(addresses(view)).toEqual(["TPool00001", "TPool00003", "TPool00004"]);
    expect(view.pagination).toEqual({ offset: 0, limit: 3, total: null, hasMore: true });
    expect(view.query).toEqual({ orderBy: "apr", sort: "desc" });
    expect(queries).toEqual([{ sort: "totalApr", desc: true, pageNo: 1, pageSize: 100 }]);
    expect(warnings).toEqual([]);
  });

  /**
   * The qualifying pools all rank past row 1000 by APR, so the first attempt reaches the limit
   * with nothing. Ordered by TVL they are all near the top, so the complete set is reachable and
   * is sorted here instead — exactly, and with ties settled by address.
   */
  it("falls back to the complete TVL set and sorts it locally", async () => {
    const tiny = Array.from({ length: 1200 }, (_, i) => fakePool(i, "1", "10"));
    const big = [
      { ...fakePool(9003, "500000", "0.05"), poolAddress: "TBig3" },
      { ...fakePool(9001, "400000", "0.050"), poolAddress: "TBig1" },
      { ...fakePool(9000, "300000", "0.10000000000000000001"), poolAddress: "TBig0" },
      { ...fakePool(9004, "200000", "0.1"), poolAddress: "TBig4" },
      { ...fakePool(9002, "100000", "0.01"), poolAddress: "TBig2" },
    ];
    const { list, queries, warnings } = scanService([...tiny, ...big]);
    const view = await list({ orderBy: "apr", minTvl: "100000", limit: 3 });
    expect(addresses(view)).toEqual(["TBig0", "TBig4", "TBig1"]);
    expect(view.pagination).toEqual({ offset: 0, limit: 3, total: null, hasMore: true });
    const second = await list({ orderBy: "apr", minTvl: "100000", limit: 3, offset: 3 });
    expect(addresses(second)).toEqual(["TBig3", "TBig2"]);
    expect(second.pagination.hasMore).toBe(false);
    // ten pages by APR, then one by TVL, which already holds the first pool below the threshold
    expect(queries.slice(0, 11).map((q) => [q.sort, q.pageNo])).toEqual([
      ...Array.from({ length: 10 }, (_, i) => ["totalApr", i + 1]),
      ["reserveUsd", 1],
    ]);
    expect(queries.slice(0, 11).every((q) => q.pageSize === 100)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("warns, rather than failing silently, when even the TVL scan cannot reach the end", async () => {
    // 1100 pools qualify, so the complete set lies past row 1000 of every ordering
    const qualifying = Array.from({ length: 1100 }, (_, i) =>
      fakePool(i, String(200000 + i), "0.01"),
    );
    const tiny = Array.from({ length: 998 }, (_, i) => fakePool(5000 + i, "1", "10"));
    const lucky = [fakePool(8000, "150000", "20"), fakePool(8001, "160000", "5")];
    const { list, queries, warnings } = scanService([...qualifying, ...tiny, ...lucky]);
    const view = await list({ orderBy: "apr", minTvl: "100000", limit: 3 });
    expect(addresses(view)).toEqual(["TPool08000", "TPool08001"]);
    expect(view.pagination).toEqual({ offset: 0, limit: 3, total: null, hasMore: true });
    expect(warnings).toEqual([
      {
        code: "sunswap_scan_truncated",
        message: expect.stringContaining("only the first 1000 pools of this ordering"),
      },
    ]);
    expect(queries).toHaveLength(20);
  });

  it("serves an ascending order through the complete set", async () => {
    const small = Array.from({ length: 1150 }, (_, i) => fakePool(i, String(1 + i)));
    const large = Array.from({ length: 50 }, (_, i) => fakePool(2000 + i, String(100000 + i)));
    const { list, warnings } = scanService([...small, ...large]);
    const view = await list({ sort: "asc", minTvl: "100000", limit: 5 });
    expect(addresses(view)).toEqual(large.slice(0, 5).map((pool) => pool.poolAddress));
    expect(view.pagination.hasMore).toBe(true);
    expect(view.query).toEqual({ orderBy: "tvl", sort: "asc" });
    expect(warnings).toEqual([]);
  });

  it.each(["-1", "abc", "1e5", ""])(
    "refuses --min-tvl %j before asking anything",
    async (minTvl) => {
      const { list, queries } = scanService(ladder);
      await expect(list({ minTvl })).rejects.toMatchObject({
        code: "invalid_value",
        message: expect.stringContaining("--min-tvl"),
      });
      expect(queries).toHaveLength(0);
    },
  );

  // Every pool has a TVL of at least zero, so a zero threshold is no threshold.
  it.each(["0", "0.00"])("treats --min-tvl %s as no threshold", async (minTvl) => {
    const { list, queries } = scanService(ladder);
    const view = await list({ minTvl, limit: 20, offset: 20 });
    expect(view.pools).toHaveLength(20);
    expect(queries).toEqual([{ sort: "reserveUsd", desc: true, pageNo: 2, pageSize: 20 }]);
    expect(view.pagination).toEqual({ offset: 20, limit: 20, total: null, hasMore: true });
  });

  it("still refuses an offset that is not a multiple of the limit", async () => {
    const { list, queries } = scanService(ladder);
    await expect(list({ minTvl: "100000", limit: 4, offset: 5 })).rejects.toMatchObject({
      code: "invalid_value",
    });
    expect(queries).toHaveLength(0);
  });
});
