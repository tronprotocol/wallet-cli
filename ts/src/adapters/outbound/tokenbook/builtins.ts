// Built-in tokens cannot be removed; native assets are supplied separately.
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
  // Transfers trust these contracts and decimals without a chain lookup; verify each network separately.
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
  "eip155:56": [],
  "eip155:11155111": [],
  "eip155:97": [],
};
