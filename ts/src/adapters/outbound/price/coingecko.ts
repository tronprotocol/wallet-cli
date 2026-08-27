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
   * MAINNETS ONLY. Test networks never reach this map — they are answered as zero before the
   * lookup (see TestnetZeroPriceProvider), because their coins are not traded.
   *
   * Each chain is listed EXPLICITLY: a bare `evm:` prefix would price every EVM chain as
   * Ethereum, so an unlisted chain like Gnosis (`evm:100`) would be valued in ETH — a claim
   * about money that nobody made. An unknown chain is worth `null`, not a guess.
   *
   * `tron:` keeps its prefix form because TRON's mainnet id is `tron:mainnet`; its testnets are
   * likewise intercepted before they arrive here.
   */
  static readonly #NATIVE_IDS: Record<string, string> = {
    "tron:": "tron",
    "evm:1": "ethereum",
    "evm:56": "binancecoin",
  };
  /**
   * CoinGecko asset-platform slugs for token_price lookups; same keying rule as above.
   *
   * Mainnets only, for the same reason as above — which also closes a real exposure: a testnet
   * contract used to be looked up against its MAINNET platform, and deterministic deployment can
   * put the same address on both chains, so a testnet token could take a real token's price.
   */
  static readonly #PLATFORMS: Record<string, string> = {
    "tron:": "tron",
    "evm:1": "ethereum",
    "evm:56": "binance-smart-chain",
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
