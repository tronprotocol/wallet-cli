/**
 * `exchange` — TRON's protocol-level Bancor market maker for TRX and TRC10.
 *
 * Four facts that run against intuition, and shape every command here:
 *   - only the pair's creator may inject or withdraw; this is private market-making, not a pool
 *     anyone can join, and the binding cannot be transferred;
 *   - TRX's on-chain token id is `_`; we accept `TRX`, `_` or a numeric TRC10 id;
 *   - `--min-received` is a floor that reverts the trade, not an expected return;
 *   - the protocol takes no fee — only `create` costs anything beyond bandwidth.
 *
 * Deviations from the v4.12.0 spec are recorded in
 * docs/asset-exchange-spec-deviations-v4.12.0.md.
 */
import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronExchangeService } from "../../../../application/use-cases/tron/exchange-service.js";
import { txModeFields } from "./shared.js";
import { TextFormatters } from "../render/index.js";

const NO_NAMES =
  "Tokens are named by id only — TRX or a numeric TRC10 id. A TRC10 name may contain ':', which " +
  "would make a pair flag ambiguous; find an id with 'asset info <name>'.";

const exchangeId = z.coerce.number().int().min(0).describe("exchange pair id");
const tokenField = (what: string) => z.string().min(1).describe(`${what}: TRX or a TRC10 id`);
const amountFields = (side: string) => ({
  amount: z.string().min(1).optional().describe(`${side}, in whole tokens`),
  rawAmount: z.string().regex(/^\d+$/).optional().describe(`${side}, in minimal units`),
});

export const exchangeCreateSpec: ChainSpec = {
  path: ["exchange", "create"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "exchange.create",
  summary: "Create a Bancor pair and seed both sides",
  description:
    "Create a Bancor exchange pair and seed it with liquidity on both sides.\n\n" +
    "IRREVERSIBLE in one respect: the creator is the ONLY account that can ever\n" +
    "inject or withdraw liquidity for this pair, and that binding cannot be moved to\n" +
    "another account. The creation fee is burned, and both initial amounts leave your\n" +
    "account on top of it.\n\n" +
    "Either side may be TRX or a TRC10 id; the two must differ. The ratio of the two\n" +
    "initial amounts is the pair's starting price. Sides keep the order you type.\n\n" +
    NO_NAMES,
  requires: ["an account with enough TRX for the fee and enough of both tokens"],
  exclusive: [{ label: "how to size both sides", flags: ["amounts", "raw-amounts"] }],
  baseFields: z.object({
    pair: z.string().min(1).describe("the two sides as <a>:<b>, TRX or a TRC10 id"),
    amounts: z
      .string()
      .min(1)
      .optional()
      .describe("amount for each side as <a>:<b>, in whole tokens"),
    rawAmounts: z
      .string()
      .min(1)
      .optional()
      .describe("amount for each side as <a>:<b>, in minimal units"),
    ...txModeFields,
  }),
  examples: [
    { cmd: "wallet-cli exchange create --pair TRX:1000123 --amounts 10000:500000 --wait" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const exchangeInjectSpec: ChainSpec = {
  path: ["exchange", "inject"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "exchange.inject",
  summary: "Add liquidity to a pair you created",
  description:
    "Add liquidity to an exchange pair, in proportion to its current reserves.\n\n" +
    "You name one side and its amount; the other side is computed from the current\n" +
    "ratio and debited as well, so you need enough of BOTH tokens. Only the account\n" +
    "that created the pair can do this.\n\n" +
    NO_NAMES,
  requires: ["the account that created the pair, holding enough of both tokens"],
  positionals: [{ field: "id" }],
  exclusive: [{ label: "how to size the amount", flags: ["amount", "raw-amount"] }],
  baseFields: z.object({
    id: exchangeId,
    token: tokenField("the side you are specifying"),
    ...amountFields("amount for that side; the other side follows the ratio"),
    ...txModeFields,
  }),
  examples: [{ cmd: "wallet-cli exchange inject 12 --token TRX --amount 1000 --wait" }],
  formatText: TextFormatters.txReceipt,
};

export const exchangeWithdrawSpec: ChainSpec = {
  path: ["exchange", "withdraw"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "exchange.withdraw",
  summary: "Take liquidity out of a pair you created",
  description:
    "Take liquidity out of an exchange pair, in proportion to its current reserves.\n\n" +
    "You name one side and its amount; the other side follows the ratio and is\n" +
    "returned as well. Only the account that created the pair can do this.\n\n" +
    "Amounts that do not divide cleanly by the reserve ratio are rejected on chain\n" +
    "for lack of precision (the quotient must be exact to within 0.01%) — round the\n" +
    "amount and try again.\n\n" +
    NO_NAMES,
  requires: ["the account that created the pair"],
  positionals: [{ field: "id" }],
  exclusive: [{ label: "how to size the amount", flags: ["amount", "raw-amount"] }],
  baseFields: z.object({
    id: exchangeId,
    token: tokenField("the side you are specifying"),
    ...amountFields("amount for that side; the other side follows the ratio"),
    ...txModeFields,
  }),
  examples: [{ cmd: "wallet-cli exchange withdraw 12 --token TRX --amount 1000 --wait" }],
  formatText: TextFormatters.txReceipt,
};

export const exchangeTradeSpec: ChainSpec = {
  path: ["exchange", "trade"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "exchange.trade",
  summary: "Swap one side of a pair for the other",
  description:
    "Swap one side of an exchange pair for the other, priced by the Bancor curve —\n" +
    "settles immediately, no counterparty, anyone may trade. The protocol takes no\n" +
    "fee; only bandwidth is spent.\n\n" +
    "--min-received is a FLOOR, not an expected return: if the trade would return\n" +
    "less, it reverts and you lose only the bandwidth. --slippage derives that floor\n" +
    "from the reserves at build time, less the percentage you give.\n\n" +
    "WITH NEITHER FLAG THERE IS NO SLIPPAGE PROTECTION: the trade accepts any\n" +
    "non-zero return at any price, and the response carries a warning saying so.\n\n" +
    NO_NAMES,
  requires: ["an account holding enough of the token being sold"],
  positionals: [{ field: "id" }],
  exclusive: [
    { label: "how to size the amount", flags: ["amount", "raw-amount"] },
    {
      label: "slippage protection (omit for none)",
      flags: ["min-received", "raw-min-received", "slippage"],
      select: "at-most-one",
    },
  ],
  baseFields: z.object({
    id: exchangeId,
    sell: tokenField("the side you are selling"),
    ...amountFields("how much to sell"),
    minReceived: z
      .string()
      .min(1)
      .optional()
      .describe("lowest acceptable return, in whole tokens; below this the trade reverts"),
    rawMinReceived: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .describe("lowest acceptable return, in minimal units"),
    slippage: z.coerce
      .number()
      .gt(0)
      .lt(100)
      .optional()
      .describe("derive the floor from current reserves, less this percentage"),
    ...txModeFields,
  }),
  examples: [
    { cmd: "wallet-cli exchange trade 12 --sell TRX --amount 100 --slippage 1 --wait" },
    { cmd: "wallet-cli exchange trade 12 --sell TRX --amount 100 --min-received 4900 --wait" },
    {
      cmd: "wallet-cli exchange trade 12 --sell TRX --amount 100 --slippage 1 --dry-run",
      note: "price it first",
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const exchangeShowSpec: ChainSpec = {
  path: ["exchange", "show"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "exchange.show",
  summary: "Show one exchange pair",
  description:
    "Show one exchange pair: creator, creation time, and both tokens with their\n" +
    "reserves in whole tokens.\n\n" +
    "No price is shown. The reserve ratio is only a quoted rate, not what a real\n" +
    "trade returns — any trade with size moves along the curve and gets less. Price a\n" +
    "specific amount with 'exchange trade --dry-run'.",
  positionals: [{ field: "id" }],
  baseFields: z.object({ id: exchangeId }),
  examples: [{ cmd: "wallet-cli exchange show 12" }],
  formatText: TextFormatters.exchangeShow,
};

export const exchangeListSpec: ChainSpec = {
  path: ["exchange", "list"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "exchange.list",
  summary: "List exchange pairs, one page at a time",
  description:
    "List exchange pairs with their two token ids, reserves and creator.\n\n" +
    "This is one RPC per call and never looks tokens up, so reserves are shown in\n" +
    "MINIMAL UNITS and tokens by id — the record carries no name or precision. Use\n" +
    "'exchange show' for one pair in whole tokens.\n\n" +
    "No total is reported: the chain does not return one without transferring every\n" +
    "record. Page until you get a short page.",
  baseFields: z.object({
    limit: z.coerce.number().int().positive().max(1000).default(10).describe("max pairs to return"),
    offset: z.coerce.number().int().min(0).default(0).describe("pagination offset"),
  }),
  examples: [
    { cmd: "wallet-cli exchange list" },
    { cmd: "wallet-cli exchange list --limit 50 --offset 50" },
  ],
  formatText: TextFormatters.exchangeList,
};

export function exchangeDefinitions(
  svc: TronExchangeService,
): Array<{ spec: ChainSpec; binding: FamilyBinding }> {
  return [
    {
      spec: exchangeCreateSpec,
      binding: { run: (ctx, net, input) => svc.create(ctx, net, input) },
    },
    {
      spec: exchangeInjectSpec,
      binding: { run: (ctx, net, input) => svc.inject(ctx, net, input) },
    },
    {
      spec: exchangeWithdrawSpec,
      binding: { run: (ctx, net, input) => svc.withdraw(ctx, net, input) },
    },
    { spec: exchangeTradeSpec, binding: { run: (ctx, net, input) => svc.trade(ctx, net, input) } },
    { spec: exchangeShowSpec, binding: { run: (_ctx, net, input) => svc.show(net, input) } },
    { spec: exchangeListSpec, binding: { run: (_ctx, net, input) => svc.list(net, input) } },
  ];
}
