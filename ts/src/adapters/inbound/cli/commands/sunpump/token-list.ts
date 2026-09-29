import { z } from "zod";
import { addressFieldsFor, allRefines } from "../../schemas/index.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { RefinementCtx } from "zod";
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
  contract: z.string().optional().describe("filter by token contract address (exact)"),
  owner: z.string().optional().describe("filter by creator address (exact)"),
  orderBy: orderByField("created"),
  sort: sortField,
  limit: limitField,
  offset: offsetField,
});

/**
 * `--owner` answers from a different endpoint, and that endpoint does not order.
 *
 * `/token/search/by_owner` returns newest-created first whatever `sort` it is given — it does not
 * reject the parameter, it drops it. Accepting `--order-by market-cap` alongside `--owner` would
 * therefore print a creation-ordered list under a market-cap heading, so the combination is
 * refused instead. Ordering a creator's tokens is not available; listing them is.
 */
function refuseOrderingWithOwner(value: Record<string, unknown>, ctx: RefinementCtx): void {
  if (value.owner === undefined) return;
  for (const flag of ["orderBy", "sort"] as const) {
    if (value[flag] === undefined) continue;
    const isDefault =
      (flag === "orderBy" && value[flag] === "created") ||
      (flag === "sort" && value[flag] === "desc");
    if (isDefault) continue;
    ctx.addIssue({
      code: "custom",
      path: [flag],
      message:
        "cannot be given with --owner: the by-creator listing is always ordered by created, desc",
      params: { errorCode: "invalid_option" },
    });
  }
}

export const sunpumpTokenListSpec: ChainSpec = {
  path: ["sunpump", "token-list"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "sunpump.market",
  summary: "List tokens on the SunPump launchpad",
  description:
    "List tokens on the SunPump launchpad.\n" +
    `Rank them with --order-by (${ORDER_BY_LIST}); find a creator's tokens with --owner.\n` +
    "To find tokens by symbol or name, use 'wallet-cli sunpump token-search'.\n\n" +
    "Status is the launchpad indexer's own: CREATED means still on the bonding curve, LAUNCHED\n" +
    "means liquidity has moved to a SunSwap pool. It is NOT evidence that a trade will succeed —\n" +
    "'sunpump buy' and 'sunpump sell' read the curve contract for that.\n\n" +
    "There is no result total: the service reports 0 on every page, including full ones, so the\n" +
    "only way to know a listing has ended is a page shorter than --limit.",
  baseFields: fields,
  baseRefine: allRefines(
    addressFieldsFor("tron", "contract", "owner"),
    refuseOrderingWithOwner,
    pageWindowRefine,
  ),
  examples: [
    { cmd: "wallet-cli sunpump token-list --order-by market-cap --limit 10" },
    { cmd: "wallet-cli sunpump token-list --owner TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj" },
  ],
  formatText: TextFormatters.sunpumpTokenList,
};

export const sunpumpTokenListTronBinding = (service: SunPumpMarketQueryService): FamilyBinding => ({
  run: async (_ctx, net, input) =>
    service.tokenList(net, {
      orderBy: input.orderBy,
      sort: input.sort,
      limit: input.limit,
      offset: input.offset,
      ...(input.contract === undefined ? {} : { contract: input.contract }),
      ...(input.owner === undefined ? {} : { owner: input.owner }),
    }),
});
