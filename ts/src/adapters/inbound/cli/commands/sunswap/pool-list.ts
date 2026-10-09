import { z, type RefinementCtx } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapMarketQueryService } from "../../../../../application/use-cases/tron/sunswap/market-query-service.js";
import { TextFormatters } from "../../render/index.js";
import { limitField, offsetField, protocolFilterField } from "./shared.js";

const fields = z.object({
  pool: z
    .string()
    .optional()
    .describe(
      "filter by pool: a 64-hex pool id for V4 (not a contract), the pool contract address otherwise",
    ),
  token: z
    .string()
    .optional()
    .describe(
      "filter by a token in the pool, symbol or contract address; TRX matches native TRX pools, pass WTRX for wrapped ones",
    ),
  protocol: protocolFilterField,
  minTvl: z
    .string()
    .optional()
    .describe("only pools with at least this TVL, in USD; applied before --limit/--offset"),
  orderBy: z.string().default("tvl").describe("order by: tvl, volume-24h, fees-24h, apr"),
  sort: z.string().default("desc").describe("sort direction: asc, desc"),
  limit: limitField,
  offset: offsetField,
});

/**
 * The service refuses `poolAddress` and `tokenAddress` together, and so must we — but as a usage
 * error, not as its error.
 *
 * Passed through, the refusal arrives as `provider_error`: exit 1, retry "same". That tells a
 * caller retrying the identical command might work, when it never can, and blames the service
 * for what the command line got wrong. Only this layer knows whose fault it is.
 */
function refuseBothFilters(value: { pool?: string; token?: string }, ctx: RefinementCtx): void {
  if (value.pool !== undefined && value.token !== undefined) {
    ctx.addIssue({
      code: "custom",
      // the path names the offending flag, which the parser puts in front of this message
      path: ["pool"],
      message: "cannot be combined with --token; narrow by one or by neither",
      // invalid_option is the code for two flags that cannot be given together. Left
      // undeclared, a refine arrives as invalid_value, which describes a bad VALUE rather than a
      // bad combination of flags that are each fine on their own.
      params: { errorCode: "invalid_option" },
    });
  }
}

export const sunswapPoolListSpec: ChainSpec = {
  path: ["sunswap", "pool-list"],
  network: "optional",
  wallet: "none",
  rejectsAccount: "pool-list reads public market data and is not about any account of yours",
  auth: "none",
  capability: "sunswap.market",
  summary: "List pools, ranked by TVL, volume, fees or APR",
  description:
    "List SunSwap liquidity pools.\n" +
    "With --token, each pool also shows the price of its other tokens quoted in that token.\n" +
    "A V4 pool is identified by a 64-hex pool id rather than a contract address, because V4 pools\n" +
    "share one pool manager; querying that id as a contract fails, so read the Protocol column first.\n" +
    "When ordering by apr, set --min-tvl: tiny pools can show huge APRs that are not enterable.\n" +
    "APR comes from the data service and does not track today's volume. Liquidity commands accept\n" +
    "V2, V3 and V4 pools only.\n" +
    "--offset + --limit may not exceed 1000: the data service exposes only the first 1000 rows of\n" +
    "each ordering. With --min-tvl they count qualifying pools, and if more than 1000 pools qualify\n" +
    "a non-TVL ordering may come back incomplete, with a sunswap_scan_truncated warning.",
  baseFields: fields,
  exclusive: [
    {
      label: "how to narrow the list; omit both to list every pool",
      flags: ["pool", "token"],
      select: "at-most-one",
    },
  ],
  baseRefine: refuseBothFilters,
  examples: [
    { cmd: "wallet-cli sunswap pool-list --token USDT" },
    { cmd: "wallet-cli sunswap pool-list --order-by apr --min-tvl 100000" },
    { cmd: "wallet-cli sunswap pool-list --protocol V3 --order-by volume-24h" },
  ],
  formatText: TextFormatters.sunswapPoolList,
};

export const sunswapPoolListTronBinding = (service: SunSwapMarketQueryService): FamilyBinding => ({
  run: async (ctx, net, input) =>
    service.poolList(ctx, net, {
      orderBy: input.orderBy,
      sort: input.sort,
      limit: input.limit,
      offset: input.offset,
      ...(input.pool === undefined ? {} : { pool: input.pool }),
      ...(input.token === undefined ? {} : { token: input.token }),
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
      ...(input.minTvl === undefined ? {} : { minTvl: input.minTvl }),
    }),
});
