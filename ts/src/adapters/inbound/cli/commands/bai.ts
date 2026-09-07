import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
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

export function registerBaiCommands(registry: CommandRegistry, service: BaiService): void {
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
  registry.add({
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
      "Recharge B.AI using the selected network and token. Omit --to to recharge the API-key account, or set --to to the recipient's email or wallet address. Both modes use the same recharge flow. Mainnet TRON supports exact and exact_gasfree; BSC and Base support exact. Minimums: TRX 15, USDT/USDC 1, ETH 0.0001, SOL 0.01; other tokens have no additional minimum. Token availability depends on the network and payment service.",
    fields: rechargeFields,
    input: rechargeFields,
    examples: [
      { cmd: "wallet-cli bai recharge 10 --token USDT --network tron --password-stdin" },
      {
        cmd: "wallet-cli bai recharge 10 --token USDT --network tron --to recipient@example.com --password-stdin",
        note: "recharge another B.AI account",
      },
      { cmd: "wallet-cli bai recharge 10 --token USDT --network bsc --password-stdin" },
      { cmd: "wallet-cli bai recharge 1 --token USDC --network base --password-stdin" },
    ],
    run: async (ctx, network, input) => {
      if (!network) throw new Error("B.AI recharge requires a resolved network");
      return service.recharge(ctx, network, {
        amount: input.amount,
        token: input.token ?? (network.id === "eip155:8453" ? "USDC" : "USDT"),
        to: input.to,
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
