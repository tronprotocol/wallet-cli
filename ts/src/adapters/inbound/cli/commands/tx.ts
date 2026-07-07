import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { TronTransactionService } from "../../../../application/use-cases/tron/transaction-service.js";
import { Schemas } from "../schemas/index.js";
import {
  amountSelector,
  txModeFields,
  unifiedAmountFields,
} from "./shared.js";
import { TextFormatters } from "../render/index.js";

// baseFields today (single family). When EVM lands, move feeLimit/assetId/contract into the TRON
// binding.fields and put gasPrice/gasLimit/nonce into the EVM binding.fields (spec §4 base/delta).
const sendFields = z.object({
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

export const txSendSpec: ChainSpec = {
  path: ["tx", "send"],
  network: "optional", wallet: "optional", auth: "required",
  broadcasts: true,
  capability: "tx.send",
  summary: "Send native TRX or TRC20/TRC10 tokens with human --amount",
  baseFields: sendFields,
  baseRefine: amountSelector,
  examples: [
    { cmd: "wallet-cli tx send --to T... --amount 1" },
    { cmd: "wallet-cli tx send --to T... --token USDT --amount 5" },
    { cmd: "wallet-cli tx send --to T... --contract TR7... --amount 5" },
    { cmd: "wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const txSendTronBinding = (svc: TronTransactionService): FamilyBinding => ({
  refine: tokenOptional,
  run: async (ctx, net, input) => svc.send(ctx, net, input),
});

const broadcastFields = z.object({
  transaction: z.string().optional()
    .describe("signed TRON transaction JSON; provide this OR --tx-stdin; exactly one is required"),
});

export const txBroadcastSpec: ChainSpec = {
  path: ["tx", "broadcast"],
  stdin: "tx",
  network: "required", wallet: "none", auth: "none",
  broadcasts: true,
  capability: "tx.broadcast",
  summary: "Broadcast a presigned transaction",
  baseFields: broadcastFields,
  examples: [{ cmd: "wallet-cli tx broadcast --tx-stdin < signed.json" }],
  formatText: TextFormatters.txReceipt,
};

export const txBroadcastTronBinding = (svc: TronTransactionService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    const raw = ctx.secrets.pick(input.transaction, "tx", "transaction");
    try {
      return svc.broadcast(ctx, net, JSON.parse(raw));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new UsageError("invalid_value", "TRON presigned tx must be JSON");
      }
      throw error;
    }
  },
});

const statusFields = z.object({ txid: z.string().min(1).describe("TRON transaction id/hash") });

export const txStatusSpec: ChainSpec = {
  path: ["tx", "status"],
  network: "optional", wallet: "none", auth: "none",
  summary: "Show confirmation status of a transaction",
  baseFields: statusFields,
  examples: [{ cmd: "wallet-cli tx status --txid abc123" }],
  formatText: TextFormatters.txStatus,
};

export const txStatusTronBinding = (svc: TronTransactionService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.status(net, input.txid),
});

const infoFields = z.object({ txid: z.string().min(1).describe("TRON transaction id/hash") });

export const txInfoSpec: ChainSpec = {
  path: ["tx", "info"],
  network: "optional", wallet: "none", auth: "none",
  summary: "Show full transaction detail + receipt",
  baseFields: infoFields,
  examples: [{ cmd: "wallet-cli tx info --txid abc123" }],
  formatText: TextFormatters.txInfo,
};

export const txInfoTronBinding = (svc: TronTransactionService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.info(net, input.txid),
});

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
