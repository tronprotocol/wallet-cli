import { z } from "zod";
import type { ChainSpec, ExclusiveGroup, FamilyBinding } from "../contracts/index.js";
import type { TronTokenService } from "../../../../application/use-cases/tron/token-service.js";
import { Schemas, addressFieldsFor } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import type { TokenBookService } from "../../../../application/use-cases/token-book-service.js";
import type { EvmTokenService } from "../../../../application/use-cases/evm/token-service.js";

// TRC10 selectors belong to the TRON binding; only contract addresses are shared.
const selectorFields = z.object({
  contract: Schemas.address().optional().describe("token contract address"),
});

const evmSelector = {
  fields: z.object({
    contract: Schemas.address().describe("token contract address"),
  }),
  refine: addressFieldsFor("evm", "contract"),
};

const tronSelector = {
  fields: z.object({
    assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 numeric asset id"),
  }),
  refine: addressFieldsFor("tron", "contract"),
};

// --asset-id is a TRON field, so on EVM the group reduces to --contract alone.
const selectorGroup: ExclusiveGroup[] = [
  {
    label: "the token: a contract address, or a TRC10 id on TRON",
    flags: ["contract", "asset-id"],
  },
];

export const tokenBalanceSpec: ChainSpec = {
  path: ["token", "balance"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "account.balance.token",
  summary: "Show a single token balance",
  baseFields: selectorFields,
  exclusive: selectorGroup,
  examples: [
    { cmd: "wallet-cli token balance --contract TR7... --network nile" },
    { cmd: "wallet-cli token balance --contract 0xA0b8... --network sepolia" },
  ],
  formatText: TextFormatters.tokenBalance,
};

export const tokenBalanceEvmBinding = (svc: EvmTokenService): FamilyBinding => ({
  ...evmSelector,
  run: async (ctx, net, input) => svc.balance(ctx, net, input),
});

export const tokenInfoEvmBinding = (svc: EvmTokenService): FamilyBinding => ({
  ...evmSelector,
  run: async (ctx, net, input) => svc.info(ctx.deadline, net, input),
});

export const tokenAddEvmBinding = (svc: EvmTokenService): FamilyBinding => ({
  ...evmSelector,
  run: async (ctx, net, input) => svc.add(ctx, net, input),
});

export const tokenRemoveEvmBinding = (svc: EvmTokenService): FamilyBinding => ({
  ...evmSelector,
  run: async (ctx, net, input) => svc.remove(ctx, net, input),
});

export const tokenBalanceTronBinding = (svc: TronTokenService): FamilyBinding => ({
  ...tronSelector,
  run: async (ctx, net, input) => svc.balance(ctx, net, input),
});

export const tokenInfoSpec: ChainSpec = {
  path: ["token", "info"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "account.balance.token",
  summary: "Show token metadata",
  baseFields: selectorFields,
  exclusive: selectorGroup,
  examples: [
    { cmd: "wallet-cli token info --contract TR7... --network nile" },
    { cmd: "wallet-cli token info --contract 0xA0b8... --network sepolia" },
  ],
  formatText: TextFormatters.tokenInfo,
};

export const tokenInfoTronBinding = (svc: TronTokenService): FamilyBinding => ({
  ...tronSelector,
  run: async (ctx, net, input) => svc.info(ctx.deadline, net, input),
});

export const tokenAddSpec: ChainSpec = {
  path: ["token", "add"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "token.tokenbook",
  summary: "Add a token to the address book",
  description:
    "Add a token to the address book of the selected network, fetching its name,\n" +
    "symbol and decimals from the contract",
  baseFields: selectorFields,
  exclusive: selectorGroup,
  examples: [
    { cmd: "wallet-cli token add --contract TR7... --network nile" },
    { cmd: "wallet-cli token add --contract 0xA0b8... --network sepolia" },
  ],
  formatText: TextFormatters.tokenBookAdd,
};

export const tokenAddTronBinding = (svc: TronTokenService): FamilyBinding => ({
  ...tronSelector,
  run: async (ctx, net, input) => svc.add(ctx, net, input),
});

export const tokenListSpec: ChainSpec = {
  path: ["token", "list"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "token.tokenbook",
  summary: "List the address book",
  description: "List the address book of the selected network (official + user entries)",
  baseFields: z.object({}),
  examples: [
    { cmd: "wallet-cli token list --network nile" },
    { cmd: "wallet-cli token list --network sepolia" },
  ],
  formatText: TextFormatters.tokenBookList,
};

export const tokenListBinding = (svc: TokenBookService): FamilyBinding => ({
  run: async (ctx, net) => svc.list(ctx, net),
});

export const tokenRemoveSpec: ChainSpec = {
  path: ["token", "remove"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "token.tokenbook",
  summary: "Remove a user-added token",
  description:
    "Remove a user-added token from the address book. Official entries cannot be\n" + "removed.",
  baseFields: selectorFields,
  exclusive: selectorGroup,
  examples: [
    { cmd: "wallet-cli token remove --contract TR7... --network nile" },
    { cmd: "wallet-cli token remove --contract 0xA0b8... --network sepolia" },
  ],
  formatText: TextFormatters.tokenBookRemove,
};

export const tokenRemoveTronBinding = (svc: TronTokenService): FamilyBinding => ({
  ...tronSelector,
  run: async (ctx, net, input) => svc.remove(ctx, net, input),
});
