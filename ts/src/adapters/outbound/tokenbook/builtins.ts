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
    { kind: "trc20", id: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz", symbol: "USDD", decimals: 18, name: "Usdd Stablecoin" },
  ],
  "tron:nile": [
    { kind: "trc20", id: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", symbol: "USDT", decimals: 6, name: "Tether USD" },
    { kind: "trc20", id: "TYQF9cAeJ3Faq8QXpHxTcFco72DRCQbgFt", symbol: "USDD", decimals: 18, name: "Usdd Stablecoin" },
  ],
  "tron:shasta": [],
};
