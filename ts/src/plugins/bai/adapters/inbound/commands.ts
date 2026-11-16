import { baiRechargeText, baiUsageText, baiRecordsText, baiOrdersText } from "./render.js";
import {
  assertBaiRechargeMinimum,
  assertBaiRechargePrecision,
  baiRechargeAmount,
} from "../../domain/recharge-policy.js";
import { integerLiteral, rawPaymentAmount, paymentAmount } from "../../../x402/api.js";
import { z } from "../../../../plugin-api/cli.js";
import {
  FollowUpTable,
  type PluginChainSpec as ChainSpec,
  type PluginCommand,
  type PluginCommandContext,
  type PluginFamilyBinding as FamilyBinding,
} from "../../../../plugin-api/cli.js";
import type { BaiService } from "../../application/use-cases/bai-service.js";
import { isBaiTxHash } from "../../domain/chains.js";
import { isUserMessage } from "../../../../plugin-api/domain.js";
import { cliMessage } from "../../../../plugin-api/cli.js";
import { baiDefaultToken } from "../../application/capabilities.js";
import { BAI_FOLLOW_UPS } from "./follow-ups.js";

const requires = ["config baiApiKey"];

const listFields = z.object({
  limit: integerLiteral(1, 200).default(20).describe("maximum rows to return"),
  offset: integerLiteral(0, Number.MAX_SAFE_INTEGER)
    .default(0)
    .describe("zero-based pagination offset"),
  sort: z.enum(["asc", "desc"]).default("desc").describe("creation-time sort direction"),
});

const rechargeAmount = z.string().superRefine((value, ctx) => {
  try {
    baiRechargeAmount(value);
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "must be a positive recharge amount within the supported range",
      params: { errorCode: "invalid_amount" },
    });
  }
});

const rechargeFields = z.object({
  dryRun: z
    .boolean()
    .default(false)
    .describe("preview without creating an order, unlocking, signing or paying"),
  scheme: z.enum(["exact", "exact_gasfree"]).default("exact"),
  gasfreeRelay: z.string().optional().describe("GasFree relay: official, gasfree, or HTTPS URL"),
  maxGasfreeFee: paymentAmount.optional().describe("maximum GasFree fee in whole tokens"),
  maxGasfreeFeeRaw: rawPaymentAmount.optional().describe("maximum GasFree fee in smallest units"),
  amount: rechargeAmount,
  token: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("recharge token symbol; defaults to USDC on Base and USDT otherwise"),
  to: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .optional()
    .describe("B.AI recipient email or EVM, TRON, or Solana address; omit to recharge yourself"),
});

export const baiRechargeSpec: ChainSpec = {
  path: ["bai", "recharge"],
  formatText: baiRechargeText,
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  rejectsWait: "the recharge payment follows its own workflow and is reported to B.AI",
  capability: "bai.recharge",
  requires,
  positionals: [{ field: "amount" }],
  summary: "Recharge your own or another B.AI account",
  description:
    "Recharge B.AI using the selected network and token. Each recharge checks wallet binding with B.AI and signs a binding message if needed before creating an order or paying. Dry-run checks binding but never signs or binds. Omit --to to recharge the API-key account, or set --to to the recipient's email or wallet address. Both modes use the same recharge flow. Recharge uses local x402 on mainnet (exact, or TRON exact_gasfree): TRON USDT/USDD, BSC USDT, or Base USDC. USDT/USDC minimum: 1. Token and amount precision are checked before an order is created.",
  baseFields: rechargeFields,
  exclusive: [
    {
      label: "GasFree fee limit",
      flags: ["max-gasfree-fee", "max-gasfree-fee-raw"],
      select: "at-most-one",
    },
  ],
  examples: [
    { cmd: "wallet-cli bai recharge 10 --token USDT --network tron --password-stdin" },
    {
      cmd: "wallet-cli bai recharge 10 --token USDT --network tron --to recipient@example.com --password-stdin",
      note: "recharge another B.AI account",
    },
    { cmd: "wallet-cli bai recharge 10 --token USDT --network bsc --password-stdin" },
    { cmd: "wallet-cli bai recharge 1 --token USDC --network base --password-stdin" },
  ],
};

const FOLLOW_UPS = new FollowUpTable();
FOLLOW_UPS.register(BAI_FOLLOW_UPS);

// The result's warning field is a string; follow-up commands are spelled for the CLI.
function spelledWarning<T extends object>(result: T) {
  return "warning" in result && isUserMessage(result.warning)
    ? { ...result, warning: cliMessage(result.warning, FOLLOW_UPS).message }
    : result;
}

// `apiKey` is the configured B.AI credential.
export function baiRechargeBinding(
  serviceFor: (ctx: PluginCommandContext) => BaiService,
  apiKey: string | undefined,
): FamilyBinding {
  return {
    refine: (input, ctx) => {
      let amount: ReturnType<typeof baiRechargeAmount>;
      try {
        amount = baiRechargeAmount(input.amount);
      } catch {
        // The amount schema reports it.
        return;
      }
      try {
        // Without a token the network decides the default, so the recharge itself checks the minimum.
        if (input.token !== undefined) assertBaiRechargeMinimum(input.token, amount);
        assertBaiRechargePrecision(amount);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: error instanceof Error ? error.message : "Invalid recharge amount",
          params: { errorCode: "invalid_amount" },
        });
      }
    },
    run: async (ctx, network, input) => {
      if (!network) throw new Error("B.AI recharge requires a resolved network");
      const result = await serviceFor(ctx).recharge(ctx, network, {
        amount: input.amount,
        token: input.token ?? baiDefaultToken(network.id),
        to: input.to,
        apiKey,
        dryRun: input.dryRun,
        scheme: input.scheme,
        gasfreeRelay: input.gasfreeRelay,
        maxGasfreeFee: input.maxGasfreeFee,
        maxGasfreeFeeRaw: input.maxGasfreeFeeRaw,
      });
      return spelledWarning(result);
    },
  };
}

// The neutral B.AI commands in registration order.
export function baiCommands(
  serviceFor: (ctx: PluginCommandContext) => BaiService,
): PluginCommand[] {
  const commands: PluginCommand[] = [];

  const reportFields = z.object({
    txHash: z.string().max(66).describe("existing transaction hash from the original recharge"),
    chain: z.enum(["tron", "bnb", "base"]).describe("original recharge chain; BSC is bnb"),
    amount: rechargeAmount.optional().describe("original recharge amount, when available"),
    to: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .optional()
      .describe("original recipient identifier; pair with --target-id"),
    targetId: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .optional()
      .describe("original rechargeTarget.confirmedTarget.targetId; do not resolve a new target"),
  });
  commands.push({
    path: ["bai", "report-recharge"],
    formatText: baiRechargeText,
    network: "none",
    wallet: "none",
    auth: "none",
    broadcasts: false,
    requires,
    positionals: [{ field: "txHash" }],
    summary: "Report an existing recharge transaction without paying again",
    description:
      "Recover a failed B.AI report using the original API key, chain, hash, amount and recipient. For recipient recharge, supply both original --to and --target-id; omit both only for self recharge. Reconcile any unconfirmed candidate hash before reporting. This command does not create an order, sign, pay, or resolve a new recipient. B.AI verifies whether the reported transaction can be credited.",
    fields: reportFields,
    input: reportFields.superRefine((value, ctx) => {
      if (!isBaiTxHash(value.chain, value.txHash))
        ctx.addIssue({
          code: "custom",
          path: ["txHash"],
          message: "invalid transaction hash for chain",
        });
      if (Boolean(value.to) !== Boolean(value.targetId))
        ctx.addIssue({
          code: "custom",
          path: ["targetId"],
          message: "--to and --target-id must be supplied together",
        });
    }),
    examples: [
      { cmd: "wallet-cli bai report-recharge 0x" + "a".repeat(64) + " --chain base --amount 1" },
    ],
    run: async (ctx, _network, input) => {
      ctx.emit({
        type: "activity",
        message: "Submitting the existing transaction hash to B.AI; no new payment will be sent…",
      });
      return spelledWarning(await serviceFor(ctx).rechargeReport(ctx.deadline, input));
    },
  } satisfies PluginCommand);

  const empty = z.object({});
  commands.push({
    path: ["bai", "usage-summary"],
    formatText: baiUsageText,
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "Show B.AI usage summary",
    description:
      "Show the API-provided credit balance, current-month spend, and monthly usage trend.",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli bai usage-summary" }],
    run: async (ctx) => {
      ctx.emit({ type: "activity", message: "Fetching B.AI credit balance and usage summary…" });
      return serviceFor(ctx).usage(ctx.deadline);
    },
  } satisfies PluginCommand);

  const usageListFields = listFields.extend({
    cursor: z
      .string()
      .min(1)
      .max(8192)
      .optional()
      .describe("nextCursor returned by the preceding usage-records page"),
  });
  commands.push({
    path: ["bai", "usage-records"],
    formatText: baiRecordsText,
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "List individual B.AI usage records",
    fields: usageListFields,
    input: usageListFields,
    examples: [{ cmd: "wallet-cli bai usage-records --limit 20" }],
    run: async (ctx, _network, input) => {
      ctx.emit({ type: "activity", message: "Fetching B.AI usage records…" });
      return serviceFor(ctx).usageList(ctx.deadline, input);
    },
  } satisfies PluginCommand);

  commands.push({
    path: ["bai", "recharge-orders"],
    formatText: baiOrdersText,
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "List B.AI recharge orders",
    fields: listFields,
    input: listFields,
    examples: [{ cmd: "wallet-cli bai recharge-orders --limit 20" }],
    run: async (context, _network, input) => {
      context.emit({ type: "activity", message: "Fetching B.AI recharge orders…" });
      const { warnings, ...result } = await serviceFor(context).rechargeList(
        context.deadline,
        input,
      );
      for (const warning of warnings ?? []) context.warn(warning);
      return result;
    },
  } satisfies PluginCommand);
  return commands;
}
