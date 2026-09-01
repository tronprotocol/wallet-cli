/**
 * Official token address-book — curated per-network defaults that ship with the
 * binary. Users cannot remove these; they layer their own on top via `token add`.
 * Native TRX is NOT listed here — `portfolio` prepends it implicitly.
 */
import type { TokenEntry } from "../../../domain/types/index.js";

export const OFFICIAL_TOKENS: Record<string, TokenEntry[]> = {
  "tron:728126428": [
    {
      kind: "trc20",
      id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
    {
      kind: "trc20",
      id: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    {
      kind: "trc20",
      id: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
      symbol: "USDD",
      decimals: 18,
      name: "Usdd Stablecoin",
    },
  ],
  "tron:3448148188": [
    {
      kind: "trc20",
      id: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
    {
      kind: "trc20",
      id: "TYQF9cAeJ3Faq8QXpHxTcFco72DRCQbgFt",
      symbol: "USDD",
      decimals: 18,
      name: "Usdd Stablecoin",
    },
  ],
  "tron:2494104990": [],
  /**
   * `eip155:1` ships USDT / USDC; testnets stay empty, as `tron:2494104990` already is.
   *
   * Each address, symbol and decimals below was read FROM ETHEREUM MAINNET (eth_call for
   * symbol() / decimals() / name()) and cross-checked against Circle's published USDC address
   * and Etherscan's USDT token page. That verification matters because `tx send --token USDT`
   * takes the contract AND the decimals straight from here without asking the chain — a wrong
   * address sends to the wrong contract, and wrong decimals scale the amount by a power of ten.
   * Note USDT is 6 decimals here but 18 on BNB Smart Chain: never copy an entry between chains.
   */
  "eip155:1": [
    {
      kind: "erc20",
      id: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
    {
      kind: "erc20",
      id: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
  ],
  // Not specified, and BSC is where the decimals differ (USDT is 18 there) — left for a
  // deliberate, sourced pass rather than filled from memory.
  "eip155:56": [],
  "eip155:11155111": [],
  "eip155:97": [],
};
