import { CommandDeadline } from "../../services/command-deadline.js";
import { describe, expect, it, vi } from "vitest";
import { SunPumpMarketQueryService } from "./market-query-service.js";
import type { SunPumpMarketDataPort, SunPumpTokenRecord } from "../../ports/sunpump/market-data.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NO_DEADLINE = new CommandDeadline(0);

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
} as NetworkDescriptor;

const CREATOR = "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj";
const SOMEONE_ELSE = "TYbwCgQzMP2sDSyf1HrbMcrWRL569qtLZX";
const CONTRACT = "TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7";

function token(overrides: Partial<SunPumpTokenRecord> = {}): SunPumpTokenRecord {
  return {
    address: CONTRACT,
    symbol: "PUSS",
    name: "PUSS",
    decimals: 18,
    totalSupply: "1000000000000000000000000000",
    status: "LAUNCHED",
    owner: CREATOR,
    market: {
      marketCapUsd: "1",
      priceInTrx: "1",
      priceChange24HrPercent: "0",
      volume24HrSun: "0",
      virtualLiquidity: "0",
    },
    curve: { pumpPercentage: "100", currentSold: "0", tokenReserve: "0", trxReserve: "0" },
    createdAt: "2024-08-23 09:00",
    createTxHash: "0x",
    description: "",
    links: {},
    ...overrides,
  };
}

function port(overrides: Partial<SunPumpMarketDataPort> = {}): SunPumpMarketDataPort {
  return {
    listTokens: vi.fn(async () => ({ tokens: [token()] })),
    tokensByOwner: vi.fn(async () => ({ tokens: [token()] })),
    searchTokens: vi.fn(async () => ({ tokens: [token()] })),
    getToken: vi.fn(async () => token()),
    ...overrides,
  } as SunPumpMarketDataPort;
}

const listQuery = { orderBy: "created", sort: "desc", limit: 20, offset: 0 };

describe("tokenList routing", () => {
  it("uses the catalogue endpoint when no creator was named", async () => {
    const market = port();
    await new SunPumpMarketQueryService(market).tokenList(NO_DEADLINE, MAINNET, listQuery);
    expect(market.listTokens).toHaveBeenCalledWith(
      MAINNET,
      {
        sort: "tokenCreatedInstant:DESC",
        pageNo: 1,
        pageSize: 20,
      },
      expect.anything(),
    );
    expect(market.tokensByOwner).not.toHaveBeenCalled();
  });

  it("uses the by-creator endpoint when a creator was named", async () => {
    const market = port();
    await new SunPumpMarketQueryService(market).tokenList(NO_DEADLINE, MAINNET, {
      ...listQuery,
      owner: CREATOR,
    });
    expect(market.tokensByOwner).toHaveBeenCalledWith(
      MAINNET,
      {
        owner: CREATOR,
        pageNo: 1,
        pageSize: 20,
      },
      expect.anything(),
    );
    expect(market.listTokens).not.toHaveBeenCalled();
  });

  it("intersects contract and creator itself, because no endpoint does", async () => {
    const market = port({
      listTokens: vi.fn(async () => ({ tokens: [token({ owner: SOMEONE_ELSE })] })),
    });
    const view = await new SunPumpMarketQueryService(market).tokenList(NO_DEADLINE, MAINNET, {
      ...listQuery,
      owner: CREATOR,
      contract: CONTRACT,
    });
    expect(market.listTokens).toHaveBeenCalledWith(
      MAINNET,
      {
        sort: "tokenCreatedInstant:DESC",
        contractAddress: CONTRACT,
        pageNo: 1,
        pageSize: 20,
      },
      expect.anything(),
    );
    expect(view.tokens).toEqual([]);
  });
});

describe("the window and what is published about it", () => {
  it("turns the offset window into the service's page, and echoes the ordering", async () => {
    const market = port();
    const view = await new SunPumpMarketQueryService(market).tokenList(NO_DEADLINE, MAINNET, {
      orderBy: "market-cap",
      sort: "asc",
      limit: 10,
      offset: 30,
    });
    expect(market.listTokens).toHaveBeenCalledWith(
      MAINNET,
      {
        sort: "marketCap:ASC",
        pageNo: 4,
        pageSize: 10,
      },
      expect.anything(),
    );
    expect(view.query).toEqual({ orderBy: "market-cap", sort: "asc" });
  });

  it("publishes no total, ever", async () => {
    const service = new SunPumpMarketQueryService(port());
    const list = await service.tokenList(NO_DEADLINE, MAINNET, listQuery);
    const search = await service.tokenSearch(NO_DEADLINE, MAINNET, {
      keyword: "puss",
      orderBy: "market-cap",
      sort: "desc",
      limit: 20,
      offset: 0,
      onSunSwap: false,
      twitterLaunch: false,
      sunAgentLaunch: false,
    });
    expect(list.pagination).toEqual({ offset: 0, limit: 20, total: null });
    expect(search.pagination).toEqual({ offset: 0, limit: 20, total: null });
  });

  it("refuses an offset that no page boundary contains", async () => {
    await expect(
      new SunPumpMarketQueryService(port()).tokenList(NO_DEADLINE, MAINNET, {
        ...listQuery,
        limit: 20,
        offset: 5,
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });
});

describe("tokenSearch", () => {
  it("sends only the filters that were asked for", async () => {
    const market = port();
    await new SunPumpMarketQueryService(market).tokenSearch(NO_DEADLINE, MAINNET, {
      keyword: "  knight  ",
      orderBy: "volume-24h",
      sort: "desc",
      limit: 5,
      offset: 5,
      onSunSwap: true,
      twitterLaunch: false,
      sunAgentLaunch: false,
    });
    expect(market.searchTokens).toHaveBeenCalledWith(
      MAINNET,
      {
        keyword: "knight",
        sort: "volume24Hr:DESC",
        onSunSwap: true,
        pageNo: 2,
        pageSize: 5,
      },
      expect.anything(),
    );
  });

  it("refuses a blank keyword rather than sending it", async () => {
    const market = port();
    await expect(
      new SunPumpMarketQueryService(market).tokenSearch(NO_DEADLINE, MAINNET, {
        keyword: "   ",
        orderBy: "market-cap",
        sort: "desc",
        limit: 20,
        offset: 0,
        onSunSwap: false,
        twitterLaunch: false,
        sunAgentLaunch: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    expect(market.searchTokens).not.toHaveBeenCalled();
  });
});

describe("tokenInfo", () => {
  it("returns the token when the launchpad knows it", async () => {
    const view = await new SunPumpMarketQueryService(port()).tokenInfo(
      NO_DEADLINE,
      MAINNET,
      CONTRACT,
    );
    expect(view.token.address).toBe(CONTRACT);
  });

  it("reports an address the launchpad has never seen as not found", async () => {
    const market = port({ getToken: vi.fn(async () => null) });
    await expect(
      new SunPumpMarketQueryService(market).tokenInfo(NO_DEADLINE, MAINNET, CONTRACT),
    ).rejects.toMatchObject({ code: "launchpad_token_not_found" });
  });

  it("refuses a malformed address before asking the service", async () => {
    const market = port();
    await expect(
      new SunPumpMarketQueryService(market).tokenInfo(NO_DEADLINE, MAINNET, "not-an-address"),
    ).rejects.toMatchObject({ code: "invalid_address" });
    expect(market.getToken).not.toHaveBeenCalled();
  });
});
