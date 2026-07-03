import { describe, it, expect, afterEach, vi } from "vitest";
import { CoinGeckoPriceProvider, NullPriceProvider, createPriceProvider } from "./index.js";

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
  it("provider:none → NullPriceProvider; default → CoinGecko", () => {
    expect(createPriceProvider({ provider: "none" })).toBeInstanceOf(NullPriceProvider);
    expect(createPriceProvider(undefined)).toBeInstanceOf(CoinGeckoPriceProvider);
    expect(createPriceProvider({ provider: "coingecko" })).toBeInstanceOf(CoinGeckoPriceProvider);
  });
});
