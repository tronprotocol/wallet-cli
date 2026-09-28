import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapMarketQueryService } from "../../../../../application/use-cases/tron/sunswap/market-query-service.js";
import { TextFormatters } from "../../render/index.js";
import { limitField, offsetField, protocolField } from "./shared.js";

const fields = z.object({
  address: z.string().optional().describe("only this token contract address"),
  protocol: protocolField,
  orderBy: z.string().default("tvl").describe("order by: tvl, volume-24h"),
  limit: limitField,
  offset: offsetField,
});

export const sunswapTokenListSpec: ChainSpec = {
  path: ["sunswap", "token-list"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "sunswap.market",
  summary: "List the tokens traded on SunSwap",
  description:
    "List tokens traded on SunSwap, with price and liquidity data.\n" +
    "This is the on-chain DEX token catalogue; for the local token address book see 'wallet-cli token list'.\n" +
    "Each row is a token within one protocol scope: ALL (all protocols combined, the default) or a single protocol.\n" +
    "Rows from different scopes overlap and must not be added together.",
  baseFields: fields,
  examples: [
    { cmd: "wallet-cli sunswap token-list" },
    { cmd: "wallet-cli sunswap token-list --protocol V3" },
    { cmd: "wallet-cli sunswap token-list --protocol V3 --order-by volume-24h" },
  ],
  formatText: TextFormatters.sunswapTokenList,
};

export const sunswapTokenListTronBinding = (service: SunSwapMarketQueryService): FamilyBinding => ({
  run: async (_ctx, net, input) =>
    service.tokenList(net, {
      protocol: input.protocol,
      orderBy: input.orderBy,
      limit: input.limit,
      offset: input.offset,
      ...(input.address === undefined ? {} : { address: input.address }),
    }),
});
