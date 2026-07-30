/**
 * Official token address-book — curated per-network defaults that ship with the
 * binary. Users cannot remove these; they layer their own on top via `token add`.
 * Native TRX is NOT listed here — `portfolio` prepends it implicitly.
 */
import type { TokenEntry } from "../../../domain/types/index.js";

export const OFFICIAL_TOKENS: Record<string, TokenEntry[]> = {
  "tron:mainnet": [
    { kind: "trc20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", symbol: "USDT", decimals: 6, name: "Tether USD" },
    { kind: "trc20", id: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", symbol: "USDC", decimals: 6, name: "USD Coin" },
  ],
  "tron:nile": [],
  "tron:shasta": [],
};
