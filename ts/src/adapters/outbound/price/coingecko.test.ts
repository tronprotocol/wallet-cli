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
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toContain("/simple/token_price/tron");
      return ok({ [C.toLowerCase()]: { usd: 1.0005 } });
    }));
    const out = await new CoinGeckoPriceProvider().tokenUsd("tron:mainnet", [C]);
    expect(out.get(C)).toBe(1.0005);
  });

  it("is best-effort: non-2xx → null, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    expect(await new CoinGeckoPriceProvider().nativeUsd("tron:mainnet")).toBeNull();
  });

  it("is best-effort: a thrown fetch → null, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const p = new CoinGeckoPriceProvider();
    expect(await p.nativeUsd("tron:mainnet")).toBeNull();
    expect(await p.tokenUsd("tron:mainnet", ["TR7..."])).toEqual(new Map([["TR7...", null]]));
  });

  it("unknown contracts default to null; empty list skips the call", async () => {
    const fetchSpy = vi.fn(async () => ok({}));
    vi.stubGlobal("fetch", fetchSpy);
    const p = new CoinGeckoPriceProvider();
    expect(await p.tokenUsd("tron:mainnet", [])).toEqual(new Map());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await p.tokenUsd("tron:mainnet", ["TUnknown"])).get("TUnknown")).toBeNull();
  });

  it("sends the Pro API key header when configured", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-cg-pro-api-key"]).toBe("secret-key");
      return ok({ tron: { usd: 1 } });
    });
    vi.stubGlobal("fetch", fetchSpy);
    await new CoinGeckoPriceProvider("https://pro.example/api/v3", "secret-key").nativeUsd("tron:mainnet");
    expect(fetchSpy).toHaveBeenCalled();
  });
});
