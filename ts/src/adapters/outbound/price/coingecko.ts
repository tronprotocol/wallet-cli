/**
 * CoinGecko simple-price API client — a {@link PriceProvider} implementation.
 * native via `ids=`, TRC20 via `token_price/tron`. TRC10 → null. Best-effort:
 * any network/parse failure resolves to null (see {@link PriceProvider}).
 */
import type { PriceProvider } from "../../../application/ports/price-provider.js";

export class CoinGeckoPriceProvider implements PriceProvider {
  readonly source = "coingecko";
  /**
   * CoinGecko native coin ids.
   *
   * A testnet inherits its mainnet's price, in every family: TRON does so through the `tron:`
   * prefix, and each EVM testnet is listed EXPLICITLY beside its mainnet. The explicit listing is
   * the point — a bare `evm:` prefix would price every EVM chain as Ethereum, so an unlisted
   * chain like Gnosis (`evm:100`) would be valued in ETH, which is a claim about money that
   * nobody made. An unknown chain is worth `null`, not a guess.
   *
   * The cost of this rule is that testnet coins are valued as if they were real. That is a
   * deliberate ruling for consistency with the TRON side, which has always behaved this way.
   */
  static readonly #NATIVE_IDS: Record<string, string> = {
    "tron:": "tron",
    "evm:1": "ethereum",
    "evm:11155111": "ethereum", // Sepolia
    "evm:56": "binancecoin",
    "evm:97": "binancecoin", // BSC testnet
  };
  /**
   * CoinGecko asset-platform slugs for token_price lookups; same keying rule as above.
   *
   * A testnet contract is looked up against its MAINNET platform, which is usually a miss and so
   * usually null. It is not guaranteed to be: deterministic deployment can place the same address
   * on both chains, in which case a testnet token would take a mainnet token's price. TRON has
   * always had this exposure through its prefix; the EVM entries now share it.
   */
  static readonly #PLATFORMS: Record<string, string> = {
    "tron:": "tron",
    "evm:1": "ethereum",
    "evm:11155111": "ethereum",
    "evm:56": "binance-smart-chain",
    "evm:97": "binance-smart-chain",
  };

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
        const entry = Object.entries(body).find(
          ([addr]) => addr.toLowerCase() === contract.toLowerCase(),
        );
        if (entry) out.set(contract, num((entry[1] as { usd?: unknown })?.usd));
      }),
    );
    return out;
  }

  /** best-effort GET → parsed JSON, or null on ANY failure (network, non-2xx, bad JSON). */
  async #get(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Exact network id first, then family prefixes (the keys ending in ":").
   *
   * The exact-first rule is not a nicety: a bare startsWith would let `evm:11155111` match the
   * key `evm:1` BY ACCIDENT, and the same accident would catch every other chain whose id starts
   * with those characters. Sepolia does inherit Ethereum's price, but because it is listed, not
   * because its digits happen to line up. Prefix keys stay restricted to `family:`.
   */
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
