import { z } from "zod";
import { allRefines } from "../../schemas/index.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunPumpMarketQueryService } from "../../../../../application/use-cases/tron/sunpump/market-query-service.js";
import { TextFormatters } from "../../render/index.js";
import {
  limitField,
  offsetField,
  orderByField,
  ORDER_BY_LIST,
  pageWindowRefine,
  sortField,
} from "./market-shared.js";

const fields = z.object({
  /**
   * Empty is refused here rather than sent.
   *
   * The service treats a missing or blank search term as "no filter" and answers with the whole
   * catalogue, ranked, at HTTP 200 — which reads exactly like a successful search that happened
   * to match everything.
   */
  keyword: z
    .string()
    .refine((value) => value.trim() !== "", { message: "must not be empty" })
    .describe(
      "text to match against token symbols and names (partial, case-insensitive), or a full token contract address",
    ),
  onSunswap: z
    .boolean()
    .default(false)
    .describe("only tokens already listed on SunSwap (i.e. launched)"),
  twitterLaunch: z.boolean().default(false).describe("only tokens launched via Twitter"),
  sunAgentLaunch: z.boolean().default(false).describe("only tokens launched via a Sun agent"),
  orderBy: orderByField("market-cap"),
  sort: sortField,
  limit: limitField,
  offset: offsetField,
});

export const sunpumpTokenSearchSpec: ChainSpec = {
  path: ["sunpump", "token-search"],
  network: "optional",
  wallet: "none",
  rejectsAccount: "token-search reads public launchpad data and is not about any account of yours",
  auth: "none",
  capability: "sunpump.market",
  summary: "Search SunPump tokens by symbol or name",
  description:
    "Search SunPump tokens by symbol or name, or by a full contract address.\n" +
    `Rank the matches with --order-by (${ORDER_BY_LIST}).\n\n` +
    "Symbols and names are NOT unique: a search routinely returns several tokens calling\n" +
    "themselves the same thing, of which at most one is the one meant. Check the Address column\n" +
    "before acting on a row.\n\n" +
    "The three filters combine as an intersection. There is no result total: the service reports\n" +
    "0 on every page, so a page shorter than --limit is the only end-of-results signal.",
  baseFields: fields,
  baseRefine: allRefines(pageWindowRefine),
  positionals: [{ field: "keyword" }],
  examples: [
    { cmd: "wallet-cli sunpump token-search Knight" },
    { cmd: "wallet-cli sunpump token-search dog --on-sunswap" },
  ],
  formatText: TextFormatters.sunpumpTokenList,
};

export const sunpumpTokenSearchTronBinding = (
  service: SunPumpMarketQueryService,
): FamilyBinding => ({
  run: async (_ctx, net, input) =>
    service.tokenSearch(net, {
      keyword: input.keyword,
      orderBy: input.orderBy,
      sort: input.sort,
      onSunSwap: input.onSunswap,
      twitterLaunch: input.twitterLaunch,
      sunAgentLaunch: input.sunAgentLaunch,
      limit: input.limit,
      offset: input.offset,
    }),
});
