import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronTokenService } from "../../../../application/use-cases/tron/token-service.js";
import { Schemas, addressFieldsFor, allRefines } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import { tokenSelector } from "./token-selector.js";
import type { TokenBookService } from "../../../../application/use-cases/token-book-service.js";
import type { EvmTokenService } from "../../../../application/use-cases/evm/token-service.js";

/** Shared across families: every family has a token contract. TRC10 does not exist outside TRON,
 *  so `--asset-id` — and the "exactly one selector" rule it is half of — belong to the TRON
 *  binding below, not here. */
const selectorFields = z.object({
  contract: Schemas.address().optional().describe("token contract address"),
});

/** the EVM half: no TRC10 equivalent exists, so `--contract` is simply required, and the shared
 *  neutral field is validated as an EVM address here. */
const evmSelector = {
  refine: allRefines(
    (v: { contract?: string }, ctx: z.RefinementCtx) => {
      if (v.contract === undefined) {
        ctx.addIssue({ code: "custom", path: ["contract"], message: "--contract is required" });
      }
    },
    addressFieldsFor("evm", "contract"),
  ),
};

/** the TRON half of the selector: TRC10 asset id + the XOR rule + TRON address format. */
const tronSelector = {
  fields: z.object({
    assetId: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .describe("TRC10 numeric asset id; provide exactly one of --asset-id or --contract"),
  }),
  refine: allRefines(tokenSelector, addressFieldsFor("tron", "contract")),
};

export const tokenBalanceSpec: ChainSpec = {
  path: ["token", "balance"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "account.balance.token",
  summary: "Show a single token balance",
  baseFields: selectorFields,
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
  run: async (_ctx, net, input) => svc.info(net, input),
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
  examples: [
    { cmd: "wallet-cli token info --contract TR7... --network nile" },
    { cmd: "wallet-cli token info --contract 0xA0b8... --network sepolia" },
  ],
  formatText: TextFormatters.tokenInfo,
};

export const tokenInfoTronBinding = (svc: TronTokenService): FamilyBinding => ({
  ...tronSelector,
  run: async (_ctx, net, input) => svc.info(net, input),
});

export const tokenAddSpec: ChainSpec = {
  path: ["token", "add"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "token.tokenbook",
  summary: "Add a token to the address book",
  // §5.3: the book is PER NETWORK, and the metadata comes from the contract — the one moment
  // decimals are checked against the chain (see the token service).
  description:
    "Add a token to the address book of the selected network, fetching its name,\n" +
    "symbol and decimals from the contract",
  baseFields: selectorFields,
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
  // §5.4: which book depends on the network, and it holds two layers.
  description: "List the address book of the selected network (official + user entries)",
  baseFields: z.object({}),
  examples: [
    { cmd: "wallet-cli token list --network nile" },
    { cmd: "wallet-cli token list --network sepolia" },
  ],
  formatText: TextFormatters.tokenBookList,
};

/** Shared by every family: listing merges the book's two layers and touches no chain. */
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
  // §5.5: the refusal on an official entry is a rule worth stating before it is hit.
  description:
    "Remove a user-added token from the address book. Official entries cannot be\n" + "removed.",
  baseFields: selectorFields,
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
