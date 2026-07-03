import { z } from "zod";
import type { CommandDefinition } from "../../contracts/index.js";
import type { TronTokenService } from "../../../../../application/use-cases/tron/token-service.js";
import { Schemas } from "../../schemas/index.js";
import { TextFormatters } from "../../render/index.js";
import { tokenSelector } from "./shared.js";

const selectorFields = z.object({
  contract: Schemas.addressFor("tron").optional()
    .describe("TRC20 contract address; provide exactly one of --contract or --asset-id"),
  assetId: z.string().regex(/^\d+$/).optional()
    .describe("TRC10 numeric asset id; provide exactly one of --asset-id or --contract"),
});

export function tokenCommands(service: TronTokenService): CommandDefinition[] {
  return [balance(service), info(service), add(service), list(service), remove(service)];
}

function balance(service: TronTokenService): CommandDefinition {
  return {
    path: ["token", "balance"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    capability: "account.balance.token",
    summary: "Show a single token balance (--contract / --asset-id)",
    fields: selectorFields,
    input: selectorFields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli token balance --contract TR7..." }],
    formatText: TextFormatters.tokenBalance,
    run: async (ctx, network, input) => service.balance(ctx, network, input),
  };
}

function info(service: TronTokenService): CommandDefinition {
  return {
    path: ["token", "info"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    capability: "account.balance.token",
    summary: "Show token metadata (name/symbol/decimals/totalSupply)",
    fields: selectorFields,
    input: selectorFields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli token info --contract TR7..." }],
    formatText: TextFormatters.tokenInfo,
    run: async (_ctx, network, input) => service.info(network, input),
  };
}

function add(service: TronTokenService): CommandDefinition {
  return {
    path: ["token", "add"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    capability: "token.tokenbook",
    summary: "Add a token to the address book (fetches symbol/decimals)",
    fields: selectorFields,
    input: selectorFields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli token add --contract TR7..." }],
    formatText: TextFormatters.tokenBookAdd,
    run: async (ctx, network, input) => service.add(ctx, network, input),
  };
}

function list(service: TronTokenService): CommandDefinition {
  const fields = z.object({});
  return {
    path: ["token", "list"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    capability: "token.tokenbook",
    summary: "List the address book (official + user)",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli token list" }],
    formatText: TextFormatters.tokenBookList,
    run: async (ctx, network) => service.list(ctx, network),
  };
}

function remove(service: TronTokenService): CommandDefinition {
  return {
    path: ["token", "remove"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    capability: "token.tokenbook",
    summary: "Remove a user-added token from the address book",
    fields: selectorFields,
    input: selectorFields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli token remove --contract TR7..." }],
    formatText: TextFormatters.tokenBookRemove,
    run: async (ctx, network, input) => service.remove(ctx, network, input),
  };
}
