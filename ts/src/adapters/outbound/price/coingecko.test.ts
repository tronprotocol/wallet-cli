import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { describe, it, expect, afterEach, vi } from "vitest";
import { CoinGeckoPriceProvider } from "./coingecko.js";
import { expiredCheck, expiringCheck } from "../http/__test-support__/dispatch.js";
import { DeadlineExpiredError } from "../../../application/contracts/deadline.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const ok = (data: unknown) => ({ ok: true, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CoinGeckoPriceProvider", () => {
  it("nativeUsd queries ids=tron and extracts usd", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      expect(url).toContain("/simple/price?ids=tron");
      return ok({ tron: { usd: 0.1234 } });
    });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await new CoinGeckoPriceProvider().nativeUsd("tron:3448148188", NO_CHECK)).toBe(0.1234);
  });

  it("tokenUsd maps CoinGecko's lowercased contract keys back to caller casing", async () => {
    const C = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/simple/token_price/tron");
        return ok({ [C.toLowerCase()]: { usd: 1.0005 } });
      }),
    );
    const out = await new CoinGeckoPriceProvider().tokenUsd("tron:728126428", [C], NO_CHECK);
    expect(out.get(C)).toBe(1.0005);
  });

  it("queries each contract individually (free tier allows 1 address per request)", async () => {
    const A = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    const B = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";
    const prices: Record<string, number> = { [A.toLowerCase()]: 1.0005, [B.toLowerCase()]: 0.9998 };
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        const addrs = decodeURIComponent(url.match(/contract_addresses=([^&]+)/)![1]!).split(",");
        if (addrs.length > 1) return { ok: false } as Response;
        const key = addrs[0]!.toLowerCase();
        return ok({ [key]: { usd: prices[key] } });
      }),
    );
    const out = await new CoinGeckoPriceProvider().tokenUsd("tron:728126428", [A, B], NO_CHECK);
    expect(out.get(A)).toBe(1.0005);
    expect(out.get(B)).toBe(0.9998);
    expect(calls).toHaveLength(2);
  });

  it("is best-effort: non-2xx → null, never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false }) as Response),
    );
    expect(await new CoinGeckoPriceProvider().nativeUsd("tron:728126428", NO_CHECK)).toBeNull();
  });

  it("is best-effort: a thrown fetch → null, never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const p = new CoinGeckoPriceProvider();
    expect(await p.nativeUsd("tron:728126428", NO_CHECK)).toBeNull();
    expect(await p.tokenUsd("tron:728126428", ["TR7..."], NO_CHECK)).toEqual(
      new Map([["TR7...", null]]),
    );
  });

  it("fails the lookup when the command deadline expires during a hung fetch", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const p = new CoinGeckoPriceProvider(undefined);
    await expect(p.nativeUsd("tron:728126428", expiringCheck(20))).rejects.toBeInstanceOf(
      DeadlineExpiredError,
    );
  });

  it("fails the lookup without fetching once the deadline has expired", async () => {
    const fetchSpy = vi.fn(async () => ok({ tron: { usd: 1 } }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      new CoinGeckoPriceProvider().tokenUsd("tron:728126428", ["TToken"], expiredCheck()),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still returns null for a provider failure that is not the deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await new CoinGeckoPriceProvider().nativeUsd("tron:728126428", NO_CHECK)).toBeNull();
  });

  it("unknown contracts default to null; empty list skips the call", async () => {
    const fetchSpy = vi.fn(async () => ok({}));
    vi.stubGlobal("fetch", fetchSpy);
    const p = new CoinGeckoPriceProvider();
    expect(await p.tokenUsd("tron:728126428", [], NO_CHECK)).toEqual(new Map());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await p.tokenUsd("tron:728126428", ["TUnknown"], NO_CHECK)).get("TUnknown")).toBeNull();
  });
});

describe("CoinGeckoPriceProvider — EVM", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(body: unknown) {
    const spy = vi.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => body }));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it.each([
    ["eip155:1", "ethereum"],
    ["eip155:56", "binancecoin"],
  ])("asks for %s's own native coin id (%s)", async (networkId, coinId) => {
    const spy = stub({ [coinId]: { usd: 1234.5 } });

    expect(await new CoinGeckoPriceProvider().nativeUsd(networkId, NO_CHECK)).toBe(1234.5);
    expect(String(spy.mock.calls[0]![0])).toContain(`ids=${coinId}`);
  });

  it.each([
    ["eip155:1", "ethereum"],
    ["eip155:56", "binance-smart-chain"],
  ])("uses %s's own asset platform for token prices (%s)", async (networkId, platform) => {
    const spy = stub({ "0xabc": { usd: 1 } });
    await new CoinGeckoPriceProvider().tokenUsd(networkId, ["0xabc"], NO_CHECK);

    expect(String(spy.mock.calls[0]![0])).toContain(`/token_price/${platform}?`);
  });

  it.each(["eip155:11155111", "eip155:97"])(
    "no longer prices the testnet %s at all",
    async (networkId) => {
      const spy = stub({ ethereum: { usd: 2500 }, binancecoin: { usd: 600 } });

      expect(await new CoinGeckoPriceProvider().nativeUsd(networkId, NO_CHECK)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each(["eip155:11155111", "eip155:97"])(
    "does not look up %s's tokens either",
    async (networkId) => {
      const spy = stub({ "0xabc": { usd: 1 } });
      const prices = await new CoinGeckoPriceProvider().tokenUsd(networkId, ["0xabc"], NO_CHECK);

      expect(prices.get("0xabc")).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each(["evm:100", "evm:137", "evm:10"])("still reports no price for %s", async (networkId) => {
    const spy = stub({ ethereum: { usd: 2500 } });

    expect(await new CoinGeckoPriceProvider().nativeUsd(networkId, NO_CHECK)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports no price for a network it has never heard of", async () => {
    stub({});
    expect(await new CoinGeckoPriceProvider().nativeUsd("evm:424242", NO_CHECK)).toBeNull();
  });
});
