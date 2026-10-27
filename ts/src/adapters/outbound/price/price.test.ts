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
    expect(await p.nativeUsd("tron:728126428")).toBeNull();
    expect(await p.tokenUsd("tron:728126428", ["TR7..."])).toEqual(new Map([["TR7...", null]]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("createPriceProvider", () => {
  it("provider:none → NullPriceProvider; default → a priced provider", () => {
    expect(createPriceProvider({ provider: "none" })).toBeInstanceOf(NullPriceProvider);
    expect(createPriceProvider(undefined).source).toBe("coingecko");
    expect(createPriceProvider({ provider: "coingecko" }).source).toBe("coingecko");
  });

  describe("testnet valuation", () => {
    const provider = createPriceProvider(undefined, undefined, new Set(["eip155:11155111"]));

    it("values a testnet coin at zero without asking anyone", async () => {
      expect(await provider.nativeUsd("eip155:11155111")).toBe(0);
    });

    it("values testnet tokens at zero too", async () => {
      const prices = await provider.tokenUsd("eip155:11155111", ["0xabc", "0xdef"]);
      expect([...prices.values()]).toEqual([0, 0]);
    });

    it("leaves an undeclared network to the real provider", async () => {
      expect(await provider.nativeUsd("evm:424242")).toBeNull();
    });
  });
});
