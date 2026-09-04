import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import type { BaiService } from "../../../../application/use-cases/bai-service.js";

const requires = ["config baiApiKey"];

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD")
  .optional();

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

export function registerBaiCommands(registry: CommandRegistry, service: BaiService): void {
  const rechargeFields = z.object({
    amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "must be a decimal amount"),
    token: z
      .string()
      .trim()
      .min(1)
      .default("USDT")
      .describe("recharge token symbol; currently USDT"),
  });
  registry.add({
    path: ["bai", "recharge"],
    network: "optional",
    wallet: "optional",
    auth: "conditional",
    broadcasts: true,
    capability: "bai.recharge",
    requires,
    positionals: [{ field: "amount" }],
    summary: "Recharge B.AI through an x402 payment",
    description:
      "Recharge B.AI using the selected network and token. Mainnet TRON supports exact and exact_gasfree; BSC supports exact.",
    fields: rechargeFields,
    input: rechargeFields,
    examples: [
      { cmd: "wallet-cli bai recharge 10 --token USDT --network tron --password-stdin" },
      { cmd: "wallet-cli bai recharge 10 --token USDT --network bsc --password-stdin" },
    ],
    run: async (ctx, network, input) => {
      if (!network) throw new Error("B.AI recharge requires a resolved network");
      return service.recharge(ctx, network, {
        amount: input.amount,
        token: input.token,
        apiKey: ctx.config.baiApiKey,
      });
    },
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

  const usageFields = z.object({
    from: date.describe("first UTC day to include; defaults to 29 days before --to"),
    to: date.describe("last UTC day to include; defaults to today"),
  });
  registry.add({
    path: ["bai", "usage"],
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "Summarize B.AI usage over a UTC date range",
    fields: usageFields,
    input: usageFields,
    examples: [
      { cmd: "wallet-cli bai usage" },
      { cmd: "wallet-cli bai usage --from 2026-08-01 --to 2026-08-31" },
    ],
    run: async (_context, _network, input) => service.usage(input),
  } satisfies CommandDefinition);

  registry.add({
    path: ["bai", "usage-list"],
    network: "none",
    wallet: "none",
    auth: "none",
    requires,
    summary: "List individual B.AI usage records",
    fields: listFields,
    input: listFields,
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
