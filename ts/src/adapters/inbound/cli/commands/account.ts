import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronAccountService } from "../../../../application/use-cases/tron/account-service.js";
import { ciEnum } from "../arity/index.js";
import { TextFormatters } from "../render/index.js";

export const accountBalanceSpec: ChainSpec = {
  path: ["account", "balance"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "account.balance.native",
  summary: "Show native balance (TRX/SUN)",
  baseFields: z.object({}),
  examples: [{ cmd: "wallet-cli account balance" }],
  formatText: TextFormatters.accountBalance,
};

export const accountBalanceTronBinding = (svc: TronAccountService): FamilyBinding => ({
  run: async (ctx, net) => svc.balance(ctx, net, "tron"),
});

export const accountInfoSpec: ChainSpec = {
  path: ["account", "info"],
  network: "optional", wallet: "optional", auth: "none",
  summary: "Show raw account data (getAccount; TRON includes resources)",
  baseFields: z.object({}),
  examples: [{ cmd: "wallet-cli account info" }],
  formatText: TextFormatters.accountInfo,
};

export const accountInfoTronBinding = (svc: TronAccountService): FamilyBinding => ({
  run: async (ctx, net) => svc.info(ctx, net),
});

export const accountHistorySpec: ChainSpec = {
  path: ["account", "history"],
  network: "optional", wallet: "optional", auth: "none",
  summary: "Show transaction history (requires TronGrid)",
  baseFields: z.object({
    limit: z.coerce.number().int().positive().max(200).default(20)
      .describe("maximum records to return, in records; range: 1-200"),
    only: ciEnum(["native", "token"]).optional()
      .describe("filter history by transfer type; omit to show all transfer types"),
  }),
  examples: [{ cmd: "wallet-cli account history --limit 10" }],
  formatText: TextFormatters.accountHistory,
};

export const accountHistoryTronBinding = (svc: TronAccountService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.historyFor(ctx, net, input),
});

export const accountPortfolioSpec: ChainSpec = {
  path: ["account", "portfolio"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "account.portfolio",
  summary: "Show native + token balances with best-effort USD value",
  baseFields: z.object({}),
  examples: [{ cmd: "wallet-cli account portfolio" }],
  formatText: TextFormatters.accountPortfolio,
};

export const accountPortfolioTronBinding = (svc: TronAccountService): FamilyBinding => ({
  run: async (ctx, net) => svc.portfolio(ctx, net),
});
