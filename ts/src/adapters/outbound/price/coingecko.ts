// Price lookup failures return null; expiry of the command deadline fails the lookup.
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { abortReason } from "../http/dispatch-context.js";
import type { PriceProvider } from "../../../application/ports/price-provider.js";

export class CoinGeckoPriceProvider implements PriceProvider {
  readonly source = "coingecko";
  // Enumerate EVM networks: a namespace prefix would price unrelated chains as ETH.
  static readonly #NATIVE_IDS: Record<string, string> = {
    "tron:": "tron",
    "eip155:1": "ethereum",
    "eip155:56": "binancecoin",
  };
  // Testnet interception belongs to the provider wrapper; TRON uses a namespace prefix.
  static readonly #PLATFORMS: Record<string, string> = {
    "tron:": "tron",
    "eip155:1": "ethereum",
    "eip155:56": "binance-smart-chain",
  };

  constructor(private readonly baseUrl = "https://api.coingecko.com/api/v3") {}

  async nativeUsd(networkId: string, check: DispatchCheck): Promise<number | null> {
    const id = CoinGeckoPriceProvider.#prefixed(CoinGeckoPriceProvider.#NATIVE_IDS, networkId);
    if (!id) return null;
    const body = await this.#get(`/simple/price?ids=${id}&vs_currencies=usd`, check);
    return num(body?.[id]?.usd);
  }

  async tokenUsd(
    networkId: string,
    contracts: string[],
    check: DispatchCheck,
  ): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>(contracts.map((c) => [c, null]));
    const platform = CoinGeckoPriceProvider.#prefixed(CoinGeckoPriceProvider.#PLATFORMS, networkId);
    if (!platform || contracts.length === 0) return out;
    // The keyless API accepts one contract per request.
    await Promise.all(
      contracts.map(async (contract) => {
        const body = await this.#get(
          `/simple/token_price/${platform}?contract_addresses=${encodeURIComponent(contract)}&vs_currencies=usd`,
          check,
        );
        if (!body || typeof body !== "object") return;
        // CoinGecko returns lowercase contract keys.
        const entry = Object.entries(body).find(
          ([addr]) => addr.toLowerCase() === contract.toLowerCase(),
        );
        if (entry) out.set(contract, num((entry[1] as { usd?: unknown })?.usd));
      }),
    );
    return out;
  }

  // An unknown price is null, except when the command deadline ends the read.
  async #get(path: string, check: DispatchCheck): Promise<any | null> {
    check.assertDispatchable();
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { signal: check.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (check.signal.aborted) throw abortReason(check.signal);
      return null;
    }
  }

  // Only keys ending in ":" match prefixes; eip155:1 must not match eip155:11155111.
  static #prefixed(map: Record<string, string>, networkId: string): string | undefined {
    const exact = map[networkId];
    if (exact) return exact;
    for (const [key, value] of Object.entries(map)) {
      if (key.endsWith(":") && networkId.startsWith(key)) return value;
    }
    return undefined;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
