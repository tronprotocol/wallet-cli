import { describe, it, expect, afterEach, vi } from "vitest";
import { CoinGeckoPriceProvider } from "./coingecko.js";

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
    expect(await new CoinGeckoPriceProvider().nativeUsd("tron:nile")).toBe(0.1234);
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
    const out = await new CoinGeckoPriceProvider().tokenUsd("tron:mainnet", [C]);
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
        // CoinGecko free tier rejects requests carrying more than one contract address.
        if (addrs.length > 1) return { ok: false } as Response;
        const key = addrs[0]!.toLowerCase();
        return ok({ [key]: { usd: prices[key] } });
      }),
    );
    const out = await new CoinGeckoPriceProvider().tokenUsd("tron:mainnet", [A, B]);
    expect(out.get(A)).toBe(1.0005);
    expect(out.get(B)).toBe(0.9998);
    expect(calls).toHaveLength(2);
  });

  it("is best-effort: non-2xx → null, never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false }) as Response),
    );
    expect(await new CoinGeckoPriceProvider().nativeUsd("tron:mainnet")).toBeNull();
  });

  it("is best-effort: a thrown fetch → null, never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const p = new CoinGeckoPriceProvider();
    expect(await p.nativeUsd("tron:mainnet")).toBeNull();
    expect(await p.tokenUsd("tron:mainnet", ["TR7..."])).toEqual(new Map([["TR7...", null]]));
  });

  it("aborts a hung fetch at timeoutMs → null, never hangs", async () => {
    // hangs unless an abort signal is wired — a missing signal must fail the test, not pass it.
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const p = new CoinGeckoPriceProvider(undefined, 20);
    expect(await p.nativeUsd("tron:mainnet")).toBeNull();
  });

  it("unknown contracts default to null; empty list skips the call", async () => {
    const fetchSpy = vi.fn(async () => ok({}));
    vi.stubGlobal("fetch", fetchSpy);
    const p = new CoinGeckoPriceProvider();
    expect(await p.tokenUsd("tron:mainnet", [])).toEqual(new Map());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await p.tokenUsd("tron:mainnet", ["TUnknown"])).get("TUnknown")).toBeNull();
  });
});

describe("CoinGeckoPriceProvider — EVM", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(body: unknown) {
    const spy = vi.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => body }));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  // Prefix keying cannot express this: every tron network shares one coin, but evm:1 and evm:56
  // are DIFFERENT native coins, so EVM has to be enumerated per network id.
  it.each([
    ["evm:1", "ethereum"],
    ["evm:56", "binancecoin"],
  ])("asks for %s's own native coin id (%s)", async (networkId, coinId) => {
    const spy = stub({ [coinId]: { usd: 1234.5 } });

    expect(await new CoinGeckoPriceProvider().nativeUsd(networkId)).toBe(1234.5);
    expect(String(spy.mock.calls[0]![0])).toContain(`ids=${coinId}`);
  });

  it.each([
    ["evm:1", "ethereum"],
    ["evm:56", "binance-smart-chain"],
  ])("uses %s's own asset platform for token prices (%s)", async (networkId, platform) => {
    const spy = stub({ "0xabc": { usd: 1 } });
    await new CoinGeckoPriceProvider().tokenUsd(networkId, ["0xabc"]);

    expect(String(spy.mock.calls[0]![0])).toContain(`/token_price/${platform}?`);
  });

  /**
   * Testnets are no longer priced here at all.
   *
   * The 2026-08-24 ruling: a test coin is not traded, so its holdings are worth ZERO — a fact,
   * not a lookup. `TestnetZeroPriceProvider` answers before this class is reached, and the ids
   * were removed from the maps so a future edit cannot quietly re-enable mainnet pricing for a
   * chain whose coins are free.
   */
  it.each(["evm:11155111", "evm:97"])(
    "no longer prices the testnet %s at all",
    async (networkId) => {
      const spy = stub({ ethereum: { usd: 2500 }, binancecoin: { usd: 600 } });

      expect(await new CoinGeckoPriceProvider().nativeUsd(networkId)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    },
  );

  // The exposure this closes: deterministic deployment can put one address on both chains, so a
  // testnet token looked up against a mainnet platform could take a real token's price.
  it.each(["evm:11155111", "evm:97"])("does not look up %s's tokens either", async (networkId) => {
    const spy = stub({ "0xabc": { usd: 1 } });
    const prices = await new CoinGeckoPriceProvider().tokenUsd(networkId, ["0xabc"]);

    expect(prices.get("0xabc")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  // The counterpart to inheritance: an id that merely SHARES A PREFIX with a known one must not
  // inherit from it. Gnosis is not Ethereum, however similar `evm:100` looks to `evm:1`.
  it.each(["evm:100", "evm:137", "evm:10"])("still reports no price for %s", async (networkId) => {
    const spy = stub({ ethereum: { usd: 2500 } });

    expect(await new CoinGeckoPriceProvider().nativeUsd(networkId)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports no price for a network it has never heard of", async () => {
    stub({});
    expect(await new CoinGeckoPriceProvider().nativeUsd("evm:424242")).toBeNull();
  });
});
