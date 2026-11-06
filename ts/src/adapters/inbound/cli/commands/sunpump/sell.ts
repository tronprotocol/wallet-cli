import { z } from "zod";
import { addressFieldsFor, allRefines, Schemas, slippageField } from "../../schemas/index.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunPumpCurveTradeService } from "../../../../../application/use-cases/sunpump/curve-trade-service.js";
import { TextFormatters } from "../../render/index.js";
import { LEDGER_TRON_SETTINGS_NOTE, unsignedTxModeExclusive } from "../shared.js";
import { CURVE_TRADE_NOTES, curveTradeFields, refuseQuoteWithSendingFlags } from "./shared.js";
import { sunAmount } from "../../../../../domain/amounts/index.js";

const fields = z.object({
  token: Schemas.address().describe("the SunPump token's contract address"),
  amount: z.string().describe("tokens to sell, in whole tokens"),
  ...curveTradeFields,
});

export const sunpumpSellSpec: ChainSpec = {
  path: ["sunpump", "sell"],
  network: "optional",
  // Quotes need no account; signing modes resolve it in the use case.
  wallet: "none",
  auth: "conditional",
  broadcasts: true,
  rejectsWaitWith: "quote",
  capability: "sunpump.curve",
  summary: "Sell a token on the SunPump bonding curve",
  description:
    LEDGER_TRON_SETTINGS_NOTE +
    "Sell a token back to the curve for TRX, before it has launched.\n\n" +
    "The curve PULLS the tokens, so the launchpad is approved first — for an UNLIMITED amount,\n" +
    "unlike V2/V3 liquidity deposits, because it pulls on every sale and its contract is an\n" +
    "upgradeable proxy that expects a standing allowance. The dry run names the spender and says\n" +
    "so; the approval is sent once per token, and later sales of the same token send none.\n\n" +
    "The platform fee comes out of the proceeds, so the minimum is applied to what you receive.\n\n" +
    CURVE_TRADE_NOTES +
    "\n\nAn account is needed for every mode except --quote, which reads only.",
  exclusive: [unsignedTxModeExclusive],
  baseFields: fields,
  baseRefine: allRefines(
    addressFieldsFor("tron", "token"),
    refuseQuoteWithSendingFlags,
    slippageField(),
  ),
  positionals: [{ field: "token", placeholder: "address" }],
  examples: [
    { cmd: "wallet-cli sunpump sell <token-address> --amount 1000 --quote --network tron" },
    { cmd: "wallet-cli sunpump sell <token-address> --amount 1000 --dry-run --network tron" },
    {
      cmd: "wallet-cli sunpump sell <token-address> --amount 1000 --slippage 0.05 --wait --network tron",
      note: "sells a real asset",
    },
  ],
  formatText: TextFormatters.sunpumpTrade,
};

export const sunpumpSellTronBinding = (service: SunPumpCurveTradeService): FamilyBinding => ({
  run: async (ctx, net, input) =>
    service.sell(ctx, net, {
      token: input.token,
      amount: input.amount,
      ...(input.slippage === undefined ? {} : { slippage: input.slippage }),
      ...(input.minOut === undefined ? {} : { minOut: input.minOut }),
      ...(input.quote === undefined ? {} : { quote: input.quote }),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.buildOnly === undefined ? {} : { buildOnly: input.buildOnly }),
      ...(input.feeLimit === undefined ? {} : { feeLimit: sunAmount(input.feeLimit) }),
    }),
});
