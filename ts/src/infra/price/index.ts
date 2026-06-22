/**
 * PriceProvider (L1, §7.17) — best-effort USD valuation for `account portfolio`. A thin,
 * separate service: it NEVER throws into the command path. Any network/parse failure resolves
 * to null prices so the balance read always succeeds; portfolio surfaces a priceError note.
 */
import type { PriceConfig } from "../../core/types/index.js";

export interface PriceProvider {
  /** source label surfaced in the portfolio output (e.g. "coingecko" / "none"). */
  readonly source: string;
  /** USD per 1 native coin for a network, or null if unknown/unavailable. */
  nativeUsd(networkId: string): Promise<number | null>;
  /** USD per 1 token, keyed by contract address; missing/unknown → null. */
  tokenUsd(networkId: string, contracts: string[]): Promise<Map<string, number | null>>;
}

/** disabled provider (`price.provider: none`) — every price is null, no network calls. */
export class NullPriceProvider implements PriceProvider {
  readonly source = "none";
  async nativeUsd(_networkId: string): Promise<number | null> {
    return null;
  }
  async tokenUsd(_networkId: string, contracts: string[]): Promise<Map<string, number | null>> {
    return new Map(contracts.map((c) => [c, null]));
  }
}

/** CoinGecko simple-price API. native via `ids=`, TRC20 via `token_price/tron`. TRC10 → null. */
export class CoinGeckoPriceProvider implements PriceProvider {
  readonly source = "coingecko";
  // CoinGecko native coin ids keyed by our network-id prefix (only TRON ships in phase 1).
  static readonly #NATIVE_IDS: Record<string, string> = { "tron:": "tron" };
  // CoinGecko asset-platform slugs for token_price lookups, keyed by network-id prefix.
  static readonly #PLATFORMS: Record<string, string> = { "tron:": "tron" };

  constructor(
    private readonly baseUrl = "https://api.coingecko.com/api/v3",
    private readonly apiKey?: string,
  ) {}

  async nativeUsd(networkId: string): Promise<number | null> {
    const id = CoinGeckoPriceProvider.#prefixed(CoinGeckoPriceProvider.#NATIVE_IDS, networkId);
    if (!id) return null;
    const body = await this.#get(`/simple/price?ids=${id}&vs_currencies=usd`);
    return num(body?.[id]?.usd);
  }

  async tokenUsd(networkId: string, contracts: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>(contracts.map((c) => [c, null]));
    const platform = CoinGeckoPriceProvider.#prefixed(CoinGeckoPriceProvider.#PLATFORMS, networkId);
    if (!platform || contracts.length === 0) return out;
    // CoinGecko lowercases contract keys in its response; map back to the caller's casing.
    const byLower = new Map(contracts.map((c) => [c.toLowerCase(), c]));
    const csv = encodeURIComponent(contracts.join(","));
    const body = await this.#get(
      `/simple/token_price/${platform}?contract_addresses=${csv}&vs_currencies=usd`,
    );
    if (body && typeof body === "object") {
      for (const [addr, v] of Object.entries(body)) {
        const original = byLower.get(addr.toLowerCase());
        if (original) out.set(original, num((v as { usd?: unknown })?.usd));
      }
    }
    return out;
  }

  /** best-effort GET → parsed JSON, or null on ANY failure (network, non-2xx, bad JSON). */
  async #get(path: string): Promise<any | null> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) headers["x-cg-pro-api-key"] = this.apiKey;
      const res = await fetch(`${this.baseUrl}${path}`, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  static #prefixed(map: Record<string, string>, networkId: string): string | undefined {
    for (const [prefix, value] of Object.entries(map)) {
      if (networkId.startsWith(prefix)) return value;
    }
    return undefined;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** build the provider from config (§7.5 `price:`). Missing → CoinGecko default. */
export function createPriceProvider(price?: PriceConfig): PriceProvider {
  if (price?.provider === "none") return new NullPriceProvider();
  return new CoinGeckoPriceProvider(price?.baseUrl, price?.apiKey);
}
