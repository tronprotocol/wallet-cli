import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapMarketQueryService } from "../../../../../application/use-cases/tron/sunswap/market-query-service.js";
import { TextFormatters } from "../../render/index.js";
import { limitField, offsetField, protocolFilterField } from "./shared.js";

const fields = z.object({
  keyword: z
    .string()
    .describe(
      "token symbols to match (substring, case-insensitive; space-separated words must all match, in any order), or a full pool address or 64-hex pool id (exact)",
    ),
  protocol: protocolFilterField,
  limit: limitField,
  offset: offsetField,
});

export const sunswapPoolSearchSpec: ChainSpec = {
  path: ["sunswap", "pool-search"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "sunswap.market",
  summary: "Search pools by token symbol or pool address",
  description:
    "Search SunSwap liquidity pools, ordered by TVL, highest first.\n" +
    "Matching is on token SYMBOLS, so a search also finds pools of impersonation tokens that\n" +
    "share a real symbol. Check tokens[].address before acting on a pool this returns.\n" +
    "A V4 pool is identified by a 64-hex pool id rather than a contract address.",
  positionals: [{ field: "keyword" }],
  baseFields: fields,
  examples: [
    { cmd: 'wallet-cli sunswap pool-search "TRX USDT"' },
    { cmd: "wallet-cli sunswap pool-search USDT --protocol V3" },
  ],
  formatText: TextFormatters.sunswapPoolList,
};

export const sunswapPoolSearchTronBinding = (
  service: SunSwapMarketQueryService,
): FamilyBinding => ({
  run: async (_ctx, net, input) =>
    service.poolSearch(net, {
      keyword: input.keyword,
      limit: input.limit,
      offset: input.offset,
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
    }),
});
