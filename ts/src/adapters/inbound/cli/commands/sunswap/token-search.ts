import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapMarketQueryService } from "../../../../../application/use-cases/tron/sunswap/market-query-service.js";
import { TextFormatters } from "../../render/index.js";
import { limitField, offsetField, protocolField } from "./shared.js";

const fields = z.object({
  keyword: z
    .string()
    .describe(
      "token symbol (substring, case-insensitive; names are not matched), or a full token contract address (exact)",
    ),
  protocol: protocolField,
  limit: limitField,
  offset: offsetField,
});

export const sunswapTokenSearchSpec: ChainSpec = {
  path: ["sunswap", "token-search"],
  network: "optional",
  wallet: "none",
  rejectsAccount: "token-search reads public market data and is not about any account of yours",
  auth: "none",
  capability: "sunswap.market",
  summary: "Search the tokens traded on SunSwap by symbol",
  description:
    "Search tokens traded on SunSwap by symbol, ordered by TVL, highest first.\n" +
    "Impersonation tokens share real symbols and names; check the Address column before using a token.\n" +
    "--offset + --limit may not exceed 1000: the data service exposes only the first 1000 rows of this listing.",
  positionals: [{ field: "keyword" }],
  baseFields: fields,
  examples: [
    { cmd: "wallet-cli sunswap token-search USDT" },
    { cmd: "wallet-cli sunswap token-search BTC --protocol V3" },
  ],
  formatText: TextFormatters.sunswapTokenList,
};

export const sunswapTokenSearchTronBinding = (
  service: SunSwapMarketQueryService,
): FamilyBinding => ({
  run: async (_ctx, net, input) =>
    service.tokenSearch(net, {
      keyword: input.keyword,
      protocol: input.protocol,
      limit: input.limit,
      offset: input.offset,
    }),
});
