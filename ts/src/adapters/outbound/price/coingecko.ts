/**
 * CoinGecko simple-price API client — a {@link PriceProvider} implementation.
 * native via `ids=`, TRC20 via `token_price/tron`. TRC10 → null. Best-effort:
 * any network/parse failure resolves to null (see {@link PriceProvider}).
 */
import type { PriceProvider } from "./index.js";

export class CoinGeckoPriceProvider implements PriceProvider {
  readonly source = "coingecko";
  // CoinGecko native coin ids keyed by our network-id prefix (only TRON ships in phase 1).
  static readonly #NATIVE_IDS: Record<string, string> = { "tron:": "tron" };
  // CoinGecko asset-platform slugs for token_price lookups, keyed by network-id prefix.
  static readonly #PLATFORMS: Record<string, string> = { "tron:": "tron" };

  constructor(
    private readonly baseUrl = "https://api.coingecko.com/api/v3",
    private readonly timeoutMs = 60_000,
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
    // The keyless tier caps token_price at one contract address per request, so query each
    // contract on its own — a batched (comma-joined) request is rejected with HTTP 400.
    await Promise.all(
      contracts.map(async (contract) => {
        const body = await this.#get(
          `/simple/token_price/${platform}?contract_addresses=${encodeURIComponent(contract)}&vs_currencies=usd`,
        );
        if (!body || typeof body !== "object") return;
        // CoinGecko lowercases contract keys in its response; match case-insensitively.
        const entry = Object.entries(body).find(([addr]) => addr.toLowerCase() === contract.toLowerCase());
        if (entry) out.set(contract, num((entry[1] as { usd?: unknown })?.usd));
      }),
    );
    return out;
  }

  /** best-effort GET → parsed JSON, or null on ANY failure (network, non-2xx, bad JSON). */
  async #get(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(this.timeoutMs) });
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
