import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronAccountService } from "../../../../application/use-cases/tron/account-service.js";
import { ciEnum } from "../arity/index.js";
import { TextFormatters } from "../render/index.js";
import { txModeFields } from "./shared.js";

const transactionModeRefine = (
  input: {
    dryRun?: boolean;
    signOnly?: boolean;
    buildOnly?: boolean;
    expiration?: number;
  },
  context: z.RefinementCtx,
): void => {
  if ([input.dryRun, input.signOnly, input.buildOnly].filter(Boolean).length > 1) {
    context.addIssue({
      code: "custom",
      path: ["dryRun"],
      message: "choose at most one of --dry-run, --sign-only, --build-only",
    });
  }
  if (input.expiration !== undefined && !input.signOnly && !input.buildOnly) {
    context.addIssue({
      code: "custom",
      path: ["expiration"],
      message: "--expiration is only valid with --sign-only or --build-only",
    });
  }
};

export const accountActivateSpec: ChainSpec = {
  path: ["account", "activate"],
  network: "optional",
  wallet: "optional",
  auth: "required",
  broadcasts: true,
  capability: "account.activate",
  summary: "Activate a new TRON account",
  description:
    "Create an AccountCreateContract funded by the active account. The target must not already be active; use --dry-run to inspect current creation fees.",
  baseFields: z.object({
    address: z.string().min(1).describe("unactivated TRON base58 address"),
    ...txModeFields,
  }),
  baseRefine: transactionModeRefine,
  examples: [
    { cmd: "wallet-cli account activate --address T... --dry-run" },
    { cmd: "wallet-cli account activate --address T... --wait --password-stdin" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const accountActivateTronBinding = (
  service: TronAccountService,
): FamilyBinding => ({
  run: async (ctx, network, input) => service.activate(ctx, network, input),
});

export const accountSetSpec: ChainSpec = {
  path: ["account", "set"],
  network: "optional",
  wallet: "optional",
  auth: "required",
  broadcasts: true,
  capability: "account.set",
  summary: "Set the one-time on-chain account name or ID",
  description:
    "Set exactly one immutable account field. Names are 1-32 UTF-8 bytes; IDs are unique and 8-32 UTF-8 bytes.",
  baseFields: z.object({
    name: z.string().min(1).optional().describe("one-time on-chain account name (1-32 UTF-8 bytes)"),
    id: z.string().min(1).optional().describe("one-time unique account ID (8-32 UTF-8 bytes)"),
    ...txModeFields,
  }),
  baseRefine: (input, context) => {
    if ((input.name === undefined) === (input.id === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "provide exactly one of --name or --id",
      });
    }
    transactionModeRefine(input, context);
  },
  examples: [
    { cmd: "wallet-cli account set --name alice --dry-run" },
    { cmd: "wallet-cli account set --id alice-001 --wait --password-stdin" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const accountSetTronBinding = (
  service: TronAccountService,
): FamilyBinding => ({
  run: async (ctx, network, input) => service.setOnChain(ctx, network, input),
});

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
