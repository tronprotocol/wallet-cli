import { describe, it, expect, afterEach, vi } from "vitest";
import { NullPriceProvider, createPriceProvider } from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NullPriceProvider", () => {
  it("returns null for everything and never calls fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const p = new NullPriceProvider();
    expect(p.source).toBe("none");
    expect(await p.nativeUsd("tron:mainnet")).toBeNull();
    expect(await p.tokenUsd("tron:mainnet", ["TR7..."])).toEqual(new Map([["TR7...", null]]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("createPriceProvider", () => {
  // `provider: none` is the user switching valuation off; anything else is CoinGecko behind the
  // testnet layer, so the constructed provider is no longer the CoinGecko instance itself.
  it("provider:none → NullPriceProvider; default → a priced provider", () => {
    expect(createPriceProvider({ provider: "none" })).toBeInstanceOf(NullPriceProvider);
    expect(createPriceProvider(undefined).source).toBe("coingecko");
    expect(createPriceProvider({ provider: "coingecko" }).source).toBe("coingecko");
  });

  /**
   * §4.2 / C5: a test network's coin is not traded, so its holdings are worth zero — and ZERO,
   * not null. `null` means "we could not find out"; on a testnet there is nothing to find out,
   * and the honest answer is that the money is not real.
   */
  describe("testnet valuation", () => {
    const provider = createPriceProvider(undefined, undefined, new Set(["evm:11155111"]));

    it("values a testnet coin at zero without asking anyone", async () => {
      expect(await provider.nativeUsd("evm:11155111")).toBe(0);
    });

    it("values testnet tokens at zero too", async () => {
      const prices = await provider.tokenUsd("evm:11155111", ["0xabc", "0xdef"]);
      expect([...prices.values()]).toEqual([0, 0]);
    });

    // Unknown ≠ worthless: a chain nobody declared a testnet stays unpriced rather than zeroed.
    it("leaves an undeclared network to the real provider", async () => {
      expect(await provider.nativeUsd("evm:424242")).toBeNull();
    });
  });
});
