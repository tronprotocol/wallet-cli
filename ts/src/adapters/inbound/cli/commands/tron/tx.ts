import { z } from "zod";
import type { CommandDefinition } from "../../contracts/index.js";
import { UsageError } from "../../../../../domain/errors/index.js";
import type { TronTransactionService } from "../../../../../application/use-cases/tron/transaction-service.js";
import { Schemas } from "../../schemas/index.js";
import {
  amountSelector,
  txModeFields,
  unifiedAmountFields,
} from "../shared.js";
import { TextFormatters } from "../../render/index.js";

export function txCommands(service: TronTransactionService): CommandDefinition[] {
  return [send(service), broadcast(service), status(service), info(service)];
}

function send(service: TronTransactionService): CommandDefinition {
  const fields = z.object({
    to: Schemas.addressFor("tron").describe("recipient TRON base58 address"),
    token: z.string().min(1).optional()
      .describe("token symbol from the address book; mutually exclusive with --contract and --asset-id"),
    contract: Schemas.addressFor("tron").optional()
      .describe("TRC20 contract address; omit with --asset-id for native TRX"),
    assetId: z.string().regex(/^\d+$/).optional()
      .describe("TRC10 numeric asset id; omit with --contract for native TRX"),
    feeLimit: Schemas.positiveIntString().default("100000000")
      .describe("maximum TRX energy fee to burn for TRC20 transfers, in SUN"),
    ...unifiedAmountFields(
      "human amount: TRX for native, token units for TRC20/TRC10; mutually exclusive with --raw-amount",
      "raw integer amount in SUN or token base units; mutually exclusive with --amount",
    ),
    ...txModeFields,
  });
  return {
    path: ["tx", "send"], family: "tron",
    network: "optional", wallet: "optional", auth: "required",
    broadcasts: true,
    capability: "tx.send",
    summary: "Send native TRX or TRC20/TRC10 tokens with human --amount",
    fields,
    input: fields.superRefine(amountSelector).superRefine(tokenOptional),
    examples: [
      { cmd: "wallet-cli tx send --to T... --amount 1" },
      { cmd: "wallet-cli tx send --to T... --token USDT --amount 5" },
      { cmd: "wallet-cli tx send --to T... --contract TR7... --amount 5" },
      { cmd: "wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000" },
    ],
    formatText: TextFormatters.txReceipt,
    run: async (ctx, network, input) => service.send(ctx, network, input),
  };
}

function broadcast(service: TronTransactionService): CommandDefinition {
  const fields = z.object({
    transaction: z.string().optional()
      .describe("signed TRON transaction JSON; provide this OR --tx-stdin; exactly one is required"),
  });
  return {
    path: ["tx", "broadcast"], stdin: "tx", family: "tron",
    network: "required", wallet: "none", auth: "none",
    broadcasts: true,
    capability: "tx.broadcast",
    summary: "Broadcast a presigned transaction",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli tx broadcast --tx-stdin < signed.json" }],
    formatText: TextFormatters.txReceipt,
    run: async (ctx, network, input) => {
      const raw = ctx.secrets.pick(input.transaction, "tx", "transaction");
      try {
        return service.broadcast(ctx, network, JSON.parse(raw));
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new UsageError("invalid_value", "TRON presigned tx must be JSON");
        }
        throw error;
      }
    },
  };
}

function status(service: TronTransactionService): CommandDefinition {
  const fields = z.object({ txid: z.string().min(1).describe("TRON transaction id/hash") });
  return {
    path: ["tx", "status"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    summary: "Show confirmation status of a transaction",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli tx status --txid abc123" }],
    formatText: TextFormatters.txStatus,
    run: async (_ctx, network, input) => service.status(network, input.txid),
  };
}

function info(service: TronTransactionService): CommandDefinition {
  const fields = z.object({ txid: z.string().min(1).describe("TRON transaction id/hash") });
  return {
    path: ["tx", "info"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    summary: "Show full transaction detail + receipt",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli tx info --txid abc123" }],
    formatText: TextFormatters.txInfo,
    run: async (_ctx, network, input) => service.info(network, input.txid),
  };
}

function tokenOptional(
  value: { token?: string; contract?: string; assetId?: string },
  context: z.RefinementCtx,
): void {
  const count = [value.token, value.contract, value.assetId]
    .filter((candidate) => candidate !== undefined).length;
  if (count > 1) {
    context.addIssue({
      code: "custom",
      path: ["token"],
      message: "choose at most one of --token, --contract or --asset-id",
    });
  }
}
