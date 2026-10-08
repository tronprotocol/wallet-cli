import { z } from "zod";
import { addressFieldsFor, allRefines, Schemas, slippageField } from "../../schemas/index.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunPumpCurveTradeService } from "../../../../../application/use-cases/tron/sunpump/curve-trade-service.js";
import { TextFormatters } from "../../render/index.js";
import { LEDGER_TRON_SETTINGS_NOTE } from "../shared.js";
import { CURVE_TRADE_NOTES, curveTradeFields, refuseQuoteWithSendingFlags } from "./shared.js";

const fields = z.object({
  token: Schemas.address().describe("the SunPump token's contract address"),
  trx: z.string().describe("TRX to spend, in whole TRX; the platform fee comes out of this"),
  ...curveTradeFields,
});

export const sunpumpBuySpec: ChainSpec = {
  path: ["sunpump", "buy"],
  network: "optional",
  // `none` because `--quote` must work with no account at all, and the framework
  // resolves the active account up front for anything else. Every mode that signs resolves it in
  // the use case instead and fails with the same `missing_wallet_address` when there is none —
  // later, but identically.
  wallet: "none",
  auth: "conditional",
  broadcasts: true,
  // A quote sends nothing, so there is no confirmation for --wait or --wait-timeout to wait on.
  rejectsWaitWith: "quote",
  capability: "sunpump.curve",
  summary: "Buy a token on the SunPump bonding curve",
  description:
    LEDGER_TRON_SETTINGS_NOTE +
    "Spend TRX to buy a token that has not yet launched.\n\n" +
    "The TRX travels as the call's value, so NOTHING is approved — a buy needs no allowance.\n" +
    "--trx is the total: the platform fee is taken out of it, not added to it.\n\n" +
    CURVE_TRADE_NOTES +
    "\n\nAn account is needed for every mode except --quote, which reads only.",
  baseFields: fields,
  // A malformed address is `invalid_address` at exit 2, refused here rather than carried to a
  // node that answers with a base58 complaint at exit 1.
  baseRefine: allRefines(
    addressFieldsFor("tron", "token"),
    refuseQuoteWithSendingFlags,
    // A tolerance is pure input, so it is checked here rather than after a launchpad read.
    slippageField(),
  ),
  positionals: [{ field: "token", placeholder: "address" }],
  examples: [
    { cmd: "wallet-cli sunpump buy <token-address> --trx 1 --quote --network tron" },
    { cmd: "wallet-cli sunpump buy <token-address> --trx 1 --dry-run --network tron" },
    {
      cmd: "wallet-cli sunpump buy <token-address> --trx 1 --slippage 0.05 --wait --network tron",
      note: "spends real TRX",
    },
  ],
  formatText: TextFormatters.sunpumpTrade,
};

export const sunpumpBuyTronBinding = (service: SunPumpCurveTradeService): FamilyBinding => ({
  run: async (ctx, net, input) =>
    service.buy(ctx, net, {
      token: input.token,
      amount: input.trx,
      ...(input.slippage === undefined ? {} : { slippage: input.slippage }),
      ...(input.minOut === undefined ? {} : { minOut: input.minOut }),
      ...(input.quote === undefined ? {} : { quote: input.quote }),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.buildOnly === undefined ? {} : { buildOnly: input.buildOnly }),
      ...(input.feeLimit === undefined ? {} : { feeLimit: input.feeLimit }),
    }),
});
