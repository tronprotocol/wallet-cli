/**
 * TRON tx group (L4) — native/token transfers, broadcast, status/info.
 */
import { z } from "zod";
import type { CommandDefinition } from "../../core/types/index.js";
import { Schemas } from "../../infra/contract/index.js";
import { UsageError } from "../../core/errors/index.js";
import type { Services } from "../services.js";
import { txModeFields, txMode, outcomeData } from "../shared.js";
import { rpcOf, tokenSelector } from "./shared.js";

function sendNative(services: Services): CommandDefinition {
  const fields = z.object({
    to: Schemas.base58Address().describe("recipient TRON address"),
    amountSun: Schemas.uintString().describe("amount in SUN"),
    ...txModeFields,
  });
  return {
    id: "tron.tx.send-native", path: ["tx", "send-native"], family: "tron",
    network: "required", wallet: "optional", auth: "required", capability: "tx.native.transfer",
    summary: "transfer native SUN", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron tx send-native --network nile --to T... --amount-sun 1000000" }],
    run: async (ctx, net, input) => {
      const mode = txMode(input);
      const outcome = await services.txPipeline.run({
        ctx, net: net!, account: ctx.activeAccount, ...mode,
        build: (from) => rpcOf(net!).buildNativeTransfer(from, input.to, input.amountSun),
        estimate: async () => ({ feeModel: "tron-resource", bandwidthBurnSunIfNoFreeze: 100000 }),
      });
      return outcomeData(outcome);
    },
  };
}

function sendToken(services: Services): CommandDefinition {
  const fields = z.object({
    to: Schemas.base58Address().describe("recipient TRON address"),
    amount: Schemas.amount().describe("amount in the token's smallest unit"),
    contract: Schemas.base58Address().optional().describe("TRC20 contract"),
    assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 asset id"),
    feeLimit: z.coerce.number().int().positive().default(100_000_000).describe("energy fee cap (SUN)"),
    ...txModeFields,
  });
  return {
    id: "tron.tx.send-token", path: ["tx", "send-token"], family: "tron",
    network: "required", wallet: "optional", auth: "required", capability: "tx.token.transfer",
    summary: "transfer TRC20 (--contract) or TRC10 (--asset-id)",
    fields, input: fields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli tron tx send-token --network nile --to T... --amount 1000000 --contract TR7..." }],
    run: async (ctx, net, input) => {
      const mode = txMode(input);
      const rpc = rpcOf(net!);
      const outcome = await services.txPipeline.run({
        ctx, net: net!, account: ctx.activeAccount, ...mode,
        build: (from) =>
          input.contract
            ? rpc.buildTrc20Transfer(from, input.to, input.contract, input.amount, input.feeLimit)
            : rpc.buildTrc10Transfer(from, input.to, input.assetId!, input.amount),
        estimate: (_tx) =>
          input.contract
            ? rpc.estimateResources(ctx.resolveAddress("tron"), input.contract, "transfer(address,uint256)", [
                { type: "address", value: input.to },
                { type: "uint256", value: input.amount },
              ])
            : Promise.resolve({ feeModel: "tron-resource", note: "TRC10 transfer uses bandwidth only" }),
      });
      return outcomeData(outcome);
    },
  };
}

function broadcast(): CommandDefinition {
  // --transaction <value> OR --tx-stdin (global data channel); auth:none (holds no key).
  const fields = z.object({ transaction: z.string().optional().describe("presigned tx (or use --tx-stdin)") });
  return {
    id: "tron.tx.broadcast", path: ["tx", "broadcast"], family: "tron",
    network: "required", wallet: "none", auth: "none", capability: "tx.broadcast",
    summary: "broadcast a presigned transaction", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron tx broadcast --network nile --tx-stdin < signed.json" }],
    run: async (ctx, net, input) => {
      const raw = ctx.secrets.pick(input.transaction, "tx", "transaction");
      let signed: unknown;
      try {
        signed = JSON.parse(raw);
      } catch {
        throw new UsageError("invalid_value", "TRON presigned tx must be JSON");
      }
      return { stage: "broadcast", ...(await net!.rpc!.broadcast(signed)) };
    },
  };
}

function txStatus(): CommandDefinition {
  const fields = z.object({ txid: z.string().min(1).describe("transaction id") });
  return {
    id: "tron.tx.status", path: ["tx", "status"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    summary: "confirmation status of a transaction", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron tx status --network nile --txid abc123" }],
    run: async (_ctx, net, input) => {
      const info: any = await rpcOf(net!).getTransactionInfoById(input.txid);
      const confirmed = info && info.blockNumber !== undefined;
      return { txid: input.txid, confirmed: !!confirmed, blockNumber: info?.blockNumber, result: info?.receipt?.result };
    },
  };
}

function txInfo(): CommandDefinition {
  const fields = z.object({ txid: z.string().min(1).describe("transaction id") });
  return {
    id: "tron.tx.info", path: ["tx", "info"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    summary: "full transaction detail + receipt", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron tx info --network nile --txid abc123" }],
    run: async (_ctx, net, input) => {
      const rpc = rpcOf(net!);
      const [tx, info] = await Promise.all([rpc.getTransactionById(input.txid), rpc.getTransactionInfoById(input.txid)]);
      return { txid: input.txid, transaction: tx, info };
    },
  };
}

export function txCommands(services: Services): CommandDefinition[] {
  return [sendNative(services), sendToken(services), broadcast(), txStatus(), txInfo()];
}
