import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapMarketQueryService } from "../../../../../application/use-cases/tron/sunswap/market-query-service.js";
import { TextFormatters } from "../../render/index.js";

/**
 * One schema drives arity, validation, help and `--json-schema`.
 *
 * The two inputs are deliberately not merged into one "token or address" field. Which one the
 * caller meant decides whether a local lookup happens at all, and PM 8.3 requires giving both to
 * be an error rather than a silent preference.
 */
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

/**
 * The binding decides what the envelope publishes, and it is not the whole service result.
 *
 * `warnings` goes through `ctx.warn`, which is the only route to `meta.warnings` — the place PM
 * 8.3.4 puts it and the place a caller reads. Returning it inside the payload instead would put
 * the notice somewhere nobody looks, which is how the degraded symbol lookup went silent.
 */
export const sunswapPriceTronBinding = (service: SunSwapMarketQueryService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    const view = await service.prices(net, {
      ...(input.token === undefined ? {} : { token: input.token }),
      ...(input.address === undefined ? {} : { addresses: input.address.split(",") }),
    });
    for (const warning of view.warnings) ctx.warn(warning);
    // `view` is stripped before the JSON envelope is written: PM 8.3.4 keeps the symbol out of
    // json because a symbol is self-reported and an agent must key on the address instead.
    return { prices: view.prices, view: { symbols: Object.fromEntries(view.symbols) } };
  },
});
