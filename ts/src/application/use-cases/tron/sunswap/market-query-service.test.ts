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
    await s.poolList(MAINNET, { ...poolQuery, orderBy: "fees-24h", sort: "asc" });
    expect(poolQueries[0]).toMatchObject({ sort: "feeUsd1d", desc: false, pageNo: 1 });
  });

  it("accepts every ordering the pool endpoint has, and no others", async () => {
    const { service: s } = service();
    for (const orderBy of ["tvl", "volume-24h", "fees-24h", "apr"]) {
      await expect(s.poolList(MAINNET, { ...poolQuery, orderBy })).resolves.toBeDefined();
    }
    await expect(s.poolList(MAINNET, { ...poolQuery, orderBy: "nope" })).rejects.toMatchObject({
      code: "invalid_value",
    });
    await expect(s.poolList(MAINNET, { ...poolQuery, sort: "sideways" })).rejects.toMatchObject({
      code: "invalid_value",
    });
  });

  // The service will not match a pool id that still carries its 0x prefix.
  it("strips the 0x from a V4 pool id and leaves an address alone", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(MAINNET, { ...poolQuery, pool: `0x${V4_ID}` });
    expect(poolQueries[0]?.pool).toBe(V4_ID);
    await s.poolList(MAINNET, { ...poolQuery, pool: "TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx" });
    expect(poolQueries[1]?.pool).toBe("TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx");
  });

  it("resolves --token from a symbol, and passes an address straight through", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(MAINNET, { ...poolQuery, token: "USDT" });
    expect(poolQueries[0]?.token).toBe(USDT);
    await s.poolList(MAINNET, { ...poolQuery, token: WTRX });
    expect(poolQueries[1]?.token).toBe(WTRX);
  });

  // TRX matches native-TRX pools; swapping it for WTRX here would answer about other pools.
  it("does not swap TRX for WTRX", async () => {
    const { service: s, poolQueries } = service();
    await s.poolList(MAINNET, { ...poolQuery, token: "TRX" });
    expect(poolQueries[0]?.token).toBe(TRX);
  });

  it("quotes every pool in the chosen token and never publishes the raw rates", async () => {
    const { service: s } = service({ pools: async () => ({ pools: [onePool()] }) });
    const view = await s.poolList(MAINNET, { ...poolQuery, token: "USDT" });
    expect(view.pools[0]).not.toHaveProperty("rates");
    expect(view.pools[0]?.pairPrices).toEqual([
      { base: WTRX, quote: USDT, price: "0.343740192464323181" },
    ]);
    expect(view.view).toEqual({ quoteSymbol: "USDT" });
  });

  // Without a token to quote in there is no price to give, and no heading to name.
  it("omits pairPrices and the quote heading without --token", async () => {
    const { service: s } = service({ pools: async () => ({ pools: [onePool()] }) });
    const view = await s.poolList(MAINNET, poolQuery);
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
