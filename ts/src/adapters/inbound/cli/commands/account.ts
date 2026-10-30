import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { AccountBalanceService } from "../../../../application/use-cases/account-balance-service.js";
import type { EvmAccountService } from "../../../../application/use-cases/evm/account-service.js";
import type { TronAccountService } from "../../../../application/use-cases/tron/account-service.js";
import { ciEnum } from "../arity/index.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import { tronExpirationRefine, txModeFields, tronTxModeFields, txModeExclusive } from "./shared.js";

export const accountActivateSpec: ChainSpec = {
  path: ["account", "activate"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "account.activate",
  summary: "Activate an unactivated account",
  description:
    "Create the account on chain, funded by the active account. The target must not already be\n" +
    "active; use --dry-run to inspect current creation fees. Note: a plain transfer also activates\n" +
    "the recipient, so use this command only when the address just needs to exist.",
  exclusive: [txModeExclusive],
  baseFields: z.object({
    address: Schemas.addressFor("tron").describe("unactivated TRON base58 address"),
    ...txModeFields,
    ...tronTxModeFields,
  }),
  baseRefine: tronExpirationRefine,
  examples: [
    { cmd: "wallet-cli account activate --address T... --dry-run" },
    { cmd: "wallet-cli account activate --address T... --wait --password-stdin" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const accountActivateTronBinding = (service: TronAccountService): FamilyBinding => ({
  run: async (ctx, network, input) => service.activate(ctx, network, input),
});

export const accountSetSpec: ChainSpec = {
  path: ["account", "set"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "account.set",
  summary: "Set the on-chain account name / id",
  description:
    "Set exactly one immutable account field. Names are 1-32 UTF-8 bytes; IDs are unique and 8-32\n" +
    "UTF-8 bytes. Each can be set only once and can never be changed afterwards — rehearse with\n" +
    "--dry-run to check the value first. This is not `wallet-cli rename`, which changes the local label.",
  baseFields: z.object({
    name: z
      .string()
      .min(1)
      .optional()
      .describe("one-time on-chain account name (1-32 UTF-8 bytes)"),
    id: z.string().min(1).optional().describe("one-time unique account ID (8-32 UTF-8 bytes)"),
    ...txModeFields,
    ...tronTxModeFields,
  }),
  exclusive: [{ label: "what to set", flags: ["name", "id"] }, txModeExclusive],
  baseRefine: tronExpirationRefine,
  examples: [
    { cmd: "wallet-cli account set --name alice --dry-run" },
    { cmd: "wallet-cli account set --id alice-001 --wait --password-stdin" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const accountSetTronBinding = (service: TronAccountService): FamilyBinding => ({
  run: async (ctx, network, input) => service.setOnChain(ctx, network, input),
});

export const accountBalanceSpec: ChainSpec = {
  path: ["account", "balance"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "account.balance.native",
  summary: "Show the native coin balance",
  description: "Show the native coin balance for the selected network",
  baseFields: z.object({}),
  examples: [
    { cmd: "wallet-cli account balance --network nile" },
    { cmd: "wallet-cli account balance --network sepolia" },
  ],
  formatText: TextFormatters.accountBalance,
};

export const accountBalanceBinding = (svc: AccountBalanceService): FamilyBinding => ({
  run: async (ctx, net) => svc.balance(ctx, net, net.family),
});

export const accountInfoSpec: ChainSpec = {
  path: ["account", "info"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  summary: "Show the account's on-chain state",
  description:
    "Show the account's on-chain state for the selected network. Fields differ by\n" +
    "family: TRON reports staked amounts, resources and permissions; EVM reports the\n" +
    "transaction nonce and whether the address holds code.",
  baseFields: z.object({}),
  examples: [
    { cmd: "wallet-cli account info --network nile" },
    { cmd: "wallet-cli account info --network sepolia" },
  ],
  formatText: TextFormatters.accountInfo,
};

export const accountInfoTronBinding = (svc: TronAccountService): FamilyBinding => ({
  run: async (ctx, net) => svc.info(ctx, net),
});

export const accountPortfolioEvmBinding = (svc: EvmAccountService): FamilyBinding => ({
  run: async (ctx, net) => svc.portfolio(ctx, net),
});

export const accountInfoEvmBinding = (svc: EvmAccountService): FamilyBinding => ({
  run: async (ctx, net) => svc.info(ctx, net),
});

export const accountHistorySpec: ChainSpec = {
  path: ["account", "history"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  summary: "Show transaction history",
  baseFields: z.object({
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("maximum records to return, in records; range: 1-200"),
    only: ciEnum(["native", "token"])
      .optional()
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
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "account.portfolio",
  summary: "Show native + token balances with best-effort USD value",
  description:
    "Show the native coin balance plus every token in the address book for the selected\n" +
    "network, with a best-effort USD value. A token whose balance cannot be read is listed\n" +
    "as unavailable rather than dropped, and valuation is skipped where no price is known.",
  baseFields: z.object({}),
  examples: [
    { cmd: "wallet-cli account portfolio --network nile" },
    { cmd: "wallet-cli account portfolio --network sepolia" },
  ],
  formatText: TextFormatters.accountPortfolio,
};

export const accountPortfolioTronBinding = (svc: TronAccountService): FamilyBinding => ({
  run: async (ctx, net) => svc.portfolio(ctx, net),
});
