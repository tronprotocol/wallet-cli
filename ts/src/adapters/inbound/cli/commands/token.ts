import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronTokenService } from "../../../../application/use-cases/tron/token-service.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import { tokenSelector } from "./token-selector.js";

const selectorFields = z.object({
  contract: Schemas.addressFor("tron").optional()
    .describe("TRC20 contract address; provide exactly one of --contract or --asset-id"),
  assetId: z.string().regex(/^\d+$/).optional()
    .describe("TRC10 numeric asset id; provide exactly one of --asset-id or --contract"),
});

export const tokenBalanceSpec: ChainSpec = {
  path: ["token", "balance"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "account.balance.token",
  summary: "Show a single token balance (--contract / --asset-id)",
  baseFields: selectorFields,
  baseRefine: tokenSelector,
  examples: [{ cmd: "wallet-cli token balance --contract TR7..." }],
  formatText: TextFormatters.tokenBalance,
};

export const tokenBalanceTronBinding = (svc: TronTokenService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.balance(ctx, net, input),
});

export const tokenInfoSpec: ChainSpec = {
  path: ["token", "info"],
  network: "optional", wallet: "none", auth: "none",
  capability: "account.balance.token",
  summary: "Show token metadata (name/symbol/decimals/totalSupply)",
  baseFields: selectorFields,
  baseRefine: tokenSelector,
  examples: [{ cmd: "wallet-cli token info --contract TR7..." }],
  formatText: TextFormatters.tokenInfo,
};

export const tokenInfoTronBinding = (svc: TronTokenService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.info(net, input),
});

export const tokenAddSpec: ChainSpec = {
  path: ["token", "add"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "token.tokenbook",
  summary: "Add a token to the address book (fetches symbol/decimals)",
  baseFields: selectorFields,
  baseRefine: tokenSelector,
  examples: [{ cmd: "wallet-cli token add --contract TR7..." }],
  formatText: TextFormatters.tokenBookAdd,
};

export const tokenAddTronBinding = (svc: TronTokenService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.add(ctx, net, input),
});

export const tokenListSpec: ChainSpec = {
  path: ["token", "list"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "token.tokenbook",
  summary: "List the address book (official + user)",
  baseFields: z.object({}),
  examples: [{ cmd: "wallet-cli token list" }],
  formatText: TextFormatters.tokenBookList,
};

export const tokenListTronBinding = (svc: TronTokenService): FamilyBinding => ({
  run: async (ctx, net) => svc.list(ctx, net),
});

export const tokenRemoveSpec: ChainSpec = {
  path: ["token", "remove"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "token.tokenbook",
  summary: "Remove a user-added token from the address book",
  baseFields: selectorFields,
  baseRefine: tokenSelector,
  examples: [{ cmd: "wallet-cli token remove --contract TR7..." }],
  formatText: TextFormatters.tokenBookRemove,
};

export const tokenRemoveTronBinding = (svc: TronTokenService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.remove(ctx, net, input),
});
