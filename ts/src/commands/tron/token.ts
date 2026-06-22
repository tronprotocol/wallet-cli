/**
 * TRON token group (L4) — single-token balance + metadata (TRC20 / TRC10).
 */
import { z } from "zod";
import type { CommandDefinition } from "../../core/types/index.js";
import { Schemas } from "../../infra/contract/index.js";
import { rpcOf, tokenSelector } from "./shared.js";

function tokenBalance(): CommandDefinition {
  const fields = z.object({
    contract: Schemas.base58Address().optional().describe("TRC20 contract address; provide exactly one of --contract or --asset-id"),
    assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 numeric asset id; provide exactly one of --asset-id or --contract"),
  });
  return {
    id: "tron.token.balance", path: ["token", "balance"], family: "tron",
    network: "optional", wallet: "optional", auth: "none", capability: "account.balance.token",
    summary: "single token balance (TRC20 via --contract, TRC10 via --asset-id)",
    fields, input: fields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli tron token balance --network nile --contract TR7..." }],
    run: async (ctx, net, input) => {
      const address = ctx.resolveAddress("tron");
      const rpc = rpcOf(net!);
      const balance = input.contract
        ? await rpc.getTrc20Balance(input.contract, address)
        : await rpc.getTrc10Balance(input.assetId!, address);
      return { address, token: input.contract ?? input.assetId, balance };
    },
  };
}

function tokenInfo(): CommandDefinition {
  const fields = z.object({
    contract: Schemas.base58Address().optional().describe("TRC20 contract address; provide exactly one of --contract or --asset-id"),
    assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 numeric asset id; provide exactly one of --asset-id or --contract"),
  });
  return {
    id: "tron.token.info", path: ["token", "info"], family: "tron",
    network: "optional", wallet: "none", auth: "none", capability: "account.balance.token",
    summary: "token metadata (name/symbol/decimals/totalSupply)",
    fields, input: fields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli tron token info --network nile --contract TR7..." }],
    run: async (_ctx, net, input) => {
      const rpc = rpcOf(net!);
      return input.contract ? rpc.getTokenInfo(input.contract) : rpc.getTrc10Info(input.assetId!);
    },
  };
}

export function tokenCommands(): CommandDefinition[] {
  return [tokenBalance(), tokenInfo()];
}
