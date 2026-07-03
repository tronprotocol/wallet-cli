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

  it("queries each contract individually (free tier allows 1 address per request)", async () => {
    const A = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    const B = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";
    const prices: Record<string, number> = { [A.toLowerCase()]: 1.0005, [B.toLowerCase()]: 0.9998 };
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      const addrs = decodeURIComponent(url.match(/contract_addresses=([^&]+)/)![1]!).split(",");
      // CoinGecko free tier rejects requests carrying more than one contract address.
      if (addrs.length > 1) return { ok: false } as Response;
      const key = addrs[0]!.toLowerCase();
      return ok({ [key]: { usd: prices[key] } });
    }));
    const out = await new CoinGeckoPriceProvider().tokenUsd("tron:mainnet", [A, B]);
    expect(out.get(A)).toBe(1.0005);
    expect(out.get(B)).toBe(0.9998);
    expect(calls).toHaveLength(2);
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

  it("aborts a hung fetch at timeoutMs → null, never hangs", async () => {
    // hangs unless an abort signal is wired — a missing signal must fail the test, not pass it.
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) =>
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
