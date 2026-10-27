import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapMarketQueryService } from "../../../../../application/use-cases/tron/sunswap/market-query-service.js";
import { TextFormatters } from "../../render/index.js";

// Symbol inputs use the token book; explicit addresses bypass it.
const fields = z.object({
  token: z
    .string()
    .optional()
    .describe(
      "token symbol, e.g. TRX, resolved via the token book ('wallet-cli token list'); omit when using --address",
    ),
  address: z
    .string()
    .optional()
    .describe(
      "comma-separated token contract addresses; mutually exclusive with the token argument",
    ),
});

export const sunswapPriceSpec: ChainSpec = {
  path: ["sunswap", "price"],
  network: "optional",
  wallet: "none",
  rejectsAccount:
    "price resolves a symbol from the official token book only, so no account's token book is consulted; pass contract addresses with --address for any other token",
  auth: "none",
  capability: "sunswap.market",
  summary: "Show the USD price of one or more tokens",
  description:
    "Show the USD price of one or more tokens.\n\n" +
    "A price of 0 is an answer, not a failure: the market service returns it for any address\n" +
    "it has not indexed, including plain wallet addresses. The Symbol column comes from the\n" +
    "SunSwap catalogue and is what a contract calls itself — identify a token by its address.",
  positionals: [{ field: "token" }],
  baseFields: fields,
  examples: [
    { cmd: "wallet-cli sunswap price TRX" },
    {
      cmd: "wallet-cli sunswap price --address T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb,TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    },
  ],
  formatText: TextFormatters.sunswapPrice,
};

// Route warnings through ctx.warn so they reach envelope metadata.
export const sunswapPriceTronBinding = (service: SunSwapMarketQueryService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    const view = await service.prices(net, {
      ...(input.token === undefined ? {} : { token: input.token }),
      ...(input.address === undefined ? {} : { addresses: input.address.split(",") }),
    });
    for (const warning of view.warnings) ctx.warn(warning);
    // Symbols are display-only; JSON identifies tokens by address.
    return { prices: view.prices, view: { symbols: Object.fromEntries(view.symbols) } };
  },
});
