import { z } from "zod";
import type { CommandDefinition } from "../../contracts/index.js";
import type { TronAccountService } from "../../../../../application/use-cases/tron/account-service.js";
import { ciEnum } from "../../arity/index.js";
import { TextFormatters } from "../../render/index.js";

export function accountCommands(service: TronAccountService): CommandDefinition[] {
  return [balance(service), info(service), history(service), portfolio(service)];
}

function balance(service: TronAccountService): CommandDefinition {
  const fields = z.object({});
  return {
    path: ["account", "balance"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    capability: "account.balance.native",
    summary: "Show native balance (TRX/SUN)",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli account balance" }],
    formatText: TextFormatters.accountBalance,
    run: async (ctx, network) => service.balance(ctx, network!, "tron"),
  };
}

function info(service: TronAccountService): CommandDefinition {
  const fields = z.object({});
  return {
    path: ["account", "info"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    summary: "Show raw account data (getAccount; TRON includes resources)",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli account info" }],
    formatText: TextFormatters.accountInfo,
    run: async (ctx, network) => service.info(ctx, network!),
  };
}

function history(service: TronAccountService): CommandDefinition {
  const fields = z.object({
    limit: z.coerce.number().int().positive().max(200).default(20)
      .describe("maximum records to return, in records; range: 1-200"),
    only: ciEnum(["native", "token"]).optional()
      .describe("filter history by transfer type; omit to show all transfer types"),
  });
  return {
    path: ["account", "history"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    summary: "Show transaction history (requires TronGrid)",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli account history --limit 10" }],
    formatText: TextFormatters.accountHistory,
    run: async (ctx, network, input) => service.historyFor(ctx, network!, input),
  };
}

function portfolio(service: TronAccountService): CommandDefinition {
  const fields = z.object({});
  return {
    path: ["account", "portfolio"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    capability: "account.portfolio",
    summary: "Show native + token balances with best-effort USD value",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli account portfolio" }],
    formatText: TextFormatters.accountPortfolio,
    run: async (ctx, network) => service.portfolio(ctx, network!),
  };
}
