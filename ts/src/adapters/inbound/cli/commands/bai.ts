import { z } from "zod";
import type { CommandDefinition, ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import type { BaiService } from "../../../../application/use-cases/bai-service.js";

const requires = ["config baiApiKey"];

const listFields = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(1000)
    .default(20)
    .describe("maximum rows to return"),
  offset: z.coerce.number().int().min(0).default(0).describe("zero-based pagination offset"),
  sort: z.enum(["asc", "desc"]).default("desc").describe("creation-time sort direction"),
});

const rechargeFields = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "must be a decimal amount"),
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
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "bai.recharge",
  requires,
  positionals: [{ field: "amount" }],
  summary: "Recharge your own or another B.AI account",
  description:
    "Recharge B.AI using the selected network and token. Omit --to to recharge the API-key account, or set --to to the recipient's email or wallet address. Both modes use the same recharge flow. Recharge uses local x402 exact on mainnet: TRON USDT/USDD, BSC USDT, or Base USDC. USDT/USDC minimum: 1. Token and amount precision are checked before an order is created.",
  baseFields: rechargeFields,
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

export function baiRechargeBinding(service: BaiService): FamilyBinding {
  return {
    run: async (ctx, network, input) => {
      if (!network) throw new Error("B.AI recharge requires a resolved network");
      return service.recharge(ctx, network, {
        amount: input.amount,
        token: input.token ?? (network.id === "eip155:8453" ? "USDC" : "USDT"),
        to: input.to,
        apiKey: ctx.config.baiApiKey,
      });
    },
  };
}

export function registerBaiCommands(registry: CommandRegistry, service: BaiService): void {
  registry.addChain(baiRechargeSpec, "tron", baiRechargeBinding(service));
  registry.addChain(baiRechargeSpec, "evm", baiRechargeBinding(service));

  const reportFields = z.object({
    txHash: z.string().max(66).describe("existing transaction hash from the original recharge"),
    chain: z.enum(["tron", "bnb", "base"]).describe("original recharge chain; BSC is bnb"),
    amount: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
      .optional()
      .describe("original recharge amount, when available"),
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
  registry.add({
    path: ["bai", "recharge-report"],
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
      if (
        !(value.chain === "tron" ? /^[0-9a-fA-F]{64}$/ : /^0x[0-9a-fA-F]{64}$/).test(value.txHash)
      )
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
      { cmd: "wallet-cli bai recharge-report 0x" + "a".repeat(64) + " --chain base --amount 1" },
    ],
    run: async (_ctx, _network, input) => service.rechargeReport(input),
  } satisfies CommandDefinition);

  const empty = z.object({});
  registry.add({
    path: ["bai", "status"],
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "Show B.AI credit balance and monthly usage",
    description:
      "Show the authenticated B.AI account's credit balance, current-month spend, and monthly trend.",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli bai status" }],
    run: async () => service.status(),
  } satisfies CommandDefinition);

  registry.add({
    path: ["bai", "usage"],
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "Show B.AI usage summary",
    description:
      "Show the API-provided credit balance, current-month spend, and monthly usage trend.",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli bai usage" }],
    run: async () => service.usage(),
  } satisfies CommandDefinition);

  const usageListFields = listFields.extend({
    cursor: z
      .string()
      .min(1)
      .max(8192)
      .optional()
      .describe("nextCursor returned by the preceding usage-list page"),
  });
  registry.add({
    path: ["bai", "usage-list"],
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "List individual B.AI usage records",
    fields: usageListFields,
    input: usageListFields,
    examples: [{ cmd: "wallet-cli bai usage-list --limit 20" }],
    run: async (_context, _network, input) => service.usageList(input),
  } satisfies CommandDefinition);

  registry.add({
    path: ["bai", "recharge-list"],
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "List B.AI recharge orders",
    fields: listFields,
    input: listFields,
    examples: [{ cmd: "wallet-cli bai recharge-list --limit 20" }],
    run: async (_context, _network, input) => service.rechargeList(input),
  } satisfies CommandDefinition);
}
