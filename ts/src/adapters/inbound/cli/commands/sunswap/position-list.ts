import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapMarketQueryService } from "../../../../../application/use-cases/tron/sunswap/market-query-service.js";
import { TextFormatters } from "../../render/index.js";
import { limitField, offsetField, protocolFilterField } from "./shared.js";

const fields = z.object({
  owner: z.string().describe("the address whose positions to list"),
  pool: z
    .string()
    .optional()
    .describe(
      "only positions in this pool: a 64-hex pool id for V4 (not a contract), the pool contract address otherwise",
    ),
  protocol: protocolFilterField,
  limit: limitField,
  offset: offsetField,
});

export const sunswapPositionListSpec: ChainSpec = {
  path: ["sunswap", "position-list"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "sunswap.market",
  summary: "List the liquidity positions held by an address",
  description:
    "List the liquidity positions an address holds, most valuable first.\n" +
    "--owner is required and is never taken from the active account; this command reads any address.\n" +
    "The Position column is the id the liquidity commands take as --position-id. V2, V1, V1_5 and\n" +
    "CURVE positions are not NFTs and have no id, so they show an em dash and are identified by\n" +
    "their pool instead.\n" +
    "Status EMPTY means a V3/V4 position whose liquidity has been removed while the NFT remains.\n" +
    "A script should read extra.positionLiquidity rather than status to detect that.",
  baseFields: fields,
  examples: [
    { cmd: "wallet-cli sunswap position-list --owner T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" },
    {
      cmd: "wallet-cli sunswap position-list --owner T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb --protocol V3",
    },
  ],
  formatText: TextFormatters.sunswapPositionList,
};

export const sunswapPositionListTronBinding = (
  service: SunSwapMarketQueryService,
): FamilyBinding => ({
  run: async (_ctx, net, input) =>
    service.positionList(net, {
      owner: input.owner,
      limit: input.limit,
      offset: input.offset,
      ...(input.pool === undefined ? {} : { pool: input.pool }),
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
    }),
});
