import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { TronTransactionService } from "../../../../application/use-cases/tron/transaction-service.js";
import type { TronMultisigService } from "../../../../application/use-cases/tron/multisig-service.js";
import type { TronLinkMultisigService } from "../../../../application/use-cases/tron/tronlink-multisig-service.js";
import type { TransactionArtifactWriter } from "../../../outbound/persistence/transaction-artifact-writer.js";
import { Schemas } from "../schemas/index.js";
import {
  amountSelector,
  txModeFields,
  unifiedAmountFields,
} from "./shared.js";
import { TextFormatters } from "../render/index.js";
import { exactlyOne, readBoundedTextFile } from "./artifact.js";

// baseFields today (single family). When EVM lands, move feeLimit/assetId/contract into the TRON
// binding.fields and put gasPrice/gasLimit/nonce into the EVM binding.fields (spec §4 base/delta).
const sendFields = z.object({
  to: z.string().trim().min(1).max(128)
    .describe("recipient TRON base58 address or local contact name"),
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
    .describe("signed TRON transaction JSON; mutually exclusive with --tx-stdin/--hex/--file"),
  hex: z.string().min(2).optional().describe("complete signed protocol.Transaction hex"),
  file: z.string().min(1).optional().describe("file containing complete signed protocol.Transaction hex"),
  dryRun: z.boolean().default(false)
    .describe("validate signatures, threshold, expiration, and dynamic multi-sign fee without broadcasting"),
});

export const txBroadcastSpec: ChainSpec = {
  path: ["tx", "broadcast"],
  stdin: "tx",
  network: "optional", wallet: "none", auth: "none",
  broadcasts: true,
  capability: "tx.broadcast",
  summary: "Validate and broadcast a presigned JSON or protobuf-hex transaction",
  baseFields: broadcastFields,
  baseRefine: (input, context) => {
    if ([input.transaction, input.hex, input.file].filter((entry) => entry !== undefined).length > 1) {
      context.addIssue({
        code: "custom",
        path: ["transaction"],
        message: "--transaction, --hex, and --file are mutually exclusive",
      });
    }
  },
  examples: [
    { cmd: "wallet-cli tx broadcast --tx-stdin < signed.json" },
    { cmd: "wallet-cli tx broadcast --file signed.hex" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const txBroadcastTronBinding = (service: TronMultisigService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    if (input.dryRun && ctx.wait) {
      throw new UsageError("invalid_option", "--wait cannot be used with --dry-run");
    }
    const stdin = ctx.secrets.has("tx");
    exactlyOne(
      [input.transaction, stdin ? true : undefined, input.hex, input.file],
      "provide exactly one of --transaction, --tx-stdin, --hex, or --file",
    );
    if (input.hex || input.file) {
      const hex = input.hex ?? readBoundedTextFile(input.file, 1024 * 1024 + 4096, "transaction hex file");
      return service.broadcastHex(ctx, net, hex, input.dryRun);
    }
    const raw = ctx.secrets.pick(input.transaction, "tx", "transaction");
    try {
      return service.broadcastJson(ctx, net, JSON.parse(raw), input.dryRun);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new UsageError("invalid_value", "TRON presigned tx must be JSON");
      }
      throw error;
    }
  },
});

const artifactFields = {
  hex: z.string().min(2).optional().describe("complete protocol.Transaction hex"),
  file: z.string().min(1).optional().describe("file containing complete protocol.Transaction hex"),
};

const approvalsFields = z.object(artifactFields);

export const txApprovalsSpec: ChainSpec = {
  path: ["tx", "approvals"],
  network: "optional", wallet: "none", auth: "none",
  capability: "tx.multisig.local",
  summary: "Show permission, signature approvals, current weight, and expiration",
  description: "Inspect the transaction, selected permission group, approved signers, accumulated weight, missing weight, and expiration without signing.",
  baseFields: approvalsFields,
  baseRefine: hexOrFileRefine,
  examples: [{ cmd: "wallet-cli tx approvals --file partially-signed.hex" }],
  formatText: TextFormatters.txApprovals,
};

export const txApprovalsTronBinding = (service: TronMultisigService): FamilyBinding => ({
  run: async (_ctx, network, input) => service.approvals(network, hexInput(input)),
});

const signFields = z.object({
  transaction: z.string().min(1).optional()
    .describe("unsigned TRON transaction JSON; retained for direct single-signature compatibility"),
  ...artifactFields,
  out: z.string().min(1).optional().describe("atomically write co-signed transaction hex to this file"),
});

export const txSignSpec: ChainSpec = {
  path: ["tx", "sign"],
  network: "optional", wallet: "optional", auth: "required",
  broadcasts: false,
  capability: "tx.multisig.local",
  summary: "Sign transaction JSON or append a signature to transaction hex",
  description:
    "With --transaction, preserve the direct JSON signing flow. With --hex/--file, validate the\n" +
    "selected permission, append exactly one signature, preserve prior signatures, and report\n" +
    "the new approval weight. This command never broadcasts.",
  baseFields: signFields,
  baseRefine: (input, context) => {
    if ([input.transaction, input.hex, input.file].filter((entry) => entry !== undefined).length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["transaction"],
        message: "provide exactly one of --transaction, --hex, or --file",
      });
    }
    if (input.out && input.transaction) {
      context.addIssue({ code: "custom", path: ["out"], message: "--out is only valid with --hex or --file" });
    }
  },
  examples: [
    { cmd: `wallet-cli tx sign --transaction '{"txID":"...","raw_data":{...},"raw_data_hex":"..."}'` },
    { cmd: "wallet-cli tx sign --file partially-signed.hex --out signed.hex --password-stdin" },
  ],
  formatText: TextFormatters.txSign,
};

export const txSignTronBinding = (
  transactionService: TronTransactionService,
  multisigService: TronMultisigService,
  writer: TransactionArtifactWriter,
): FamilyBinding => ({
  run: async (ctx, net, input) => {
    exactlyOne([input.transaction, input.hex, input.file], "provide exactly one of --transaction, --hex, or --file");
    if (!input.transaction) {
      const result = await multisigService.sign(ctx, net, hexInput(input));
      if (!input.out) return result;
      writer.write(input.out, result.hex);
      return { ...result, out: input.out };
    }
    if (input.out) throw new UsageError("invalid_option", "--out is only valid with --hex or --file");
    let tx: unknown;
    try {
      tx = JSON.parse(input.transaction);
    } catch {
      throw new UsageError("invalid_value", "TRON transaction must be JSON");
    }
    return transactionService.sign(ctx, net, tx);
  },
});

const tronLinkMultisigFields = z.object({
  create: z.boolean().default(false)
    .describe("upload one unsigned transaction and open a TronLink signature collection"),
  hex: z.string().min(2).optional().describe("unsigned protocol.Transaction hex used with --create"),
  file: z.string().min(1).optional().describe("file containing unsigned transaction hex used with --create"),
  sign: z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/).optional()
    .describe("fetch and co-sign one pending TronLink transaction by txId"),
  watch: z.boolean().default(false)
    .describe("keep a WebSocket open and report only the count of transactions awaiting this account"),
});

export const txTronLinkMultisigSpec: ChainSpec = {
  path: ["tx", "multisig"],
  network: "optional", wallet: "optional", auth: "required",
  capability: "tx.multisig.tronlink",
  summary: "Coordinate multi-signature collection through the TronLink service",
  description:
    "With no mode flag, list service-managed transactions for the selected account. --create\n" +
    "uploads an UNSIGNED transaction; --sign fetches the accumulated transaction, signs locally,\n" +
    "and submits it; --watch opens the official WebSocket count-only notification channel.",
  requires: [
    "TronLink service credentials — config tronlinkSecretId / tronlinkSecretKey / tronlinkChannel",
  ],
  baseFields: tronLinkMultisigFields,
  baseRefine: tronLinkMultisigRefine,
  examples: [
    { cmd: "wallet-cli tx multisig" },
    { cmd: "wallet-cli tx multisig --create --file tx.unsigned.hex" },
    { cmd: "wallet-cli tx multisig --sign 9c1... --password-stdin" },
    { cmd: "wallet-cli tx multisig --watch" },
  ],
  formatText: TextFormatters.txTronLinkMultisig,
};

export const txTronLinkMultisigBinding = (service: TronLinkMultisigService): FamilyBinding => ({
  run: async (ctx, network, input) => {
    const address = ctx.resolveAddress("tron");
    if (input.create) return service.create(network, address, hexInput(input));
    if (input.sign) return service.sign(ctx, network, input.sign);
    if (!input.watch) return service.list(network, address);

    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    ctx.streams.event(`Watching TronLink multi-sig service for ${network.id} … (Ctrl-C to stop)`);
    try {
      return await service.watch(network, address, controller.signal, (count) => {
        ctx.streams.event(
          `🔔 You have ${count} transaction(s) to sign — view them with: wallet-cli tx multisig`,
        );
      });
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
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

function hexOrFileRefine(value: { hex?: string; file?: string }, context: z.RefinementCtx): void {
  if ([value.hex, value.file].filter((entry) => entry !== undefined).length !== 1) {
    context.addIssue({ code: "custom", path: ["hex"], message: "provide exactly one of --hex or --file" });
  }
}

function hexInput(input: { hex?: string; file?: string }): string {
  exactlyOne([input.hex, input.file], "provide exactly one of --hex or --file");
  return input.hex ?? readBoundedTextFile(input.file!, 1024 * 1024 + 4096, "transaction hex file");
}

function tronLinkMultisigRefine(
  value: z.infer<typeof tronLinkMultisigFields>,
  context: z.RefinementCtx,
): void {
  const modes = [value.create, value.sign !== undefined, value.watch].filter(Boolean).length;
  if (modes > 1) {
    context.addIssue({
      code: "custom",
      path: ["create"],
      message: "--create, --sign, and --watch are mutually exclusive",
    });
  }
  const artifacts = [value.hex, value.file].filter((entry) => entry !== undefined).length;
  if (value.create && artifacts !== 1) {
    context.addIssue({
      code: "custom",
      path: ["hex"],
      message: "--create requires exactly one of --hex or --file",
    });
  }
  if (!value.create && artifacts !== 0) {
    context.addIssue({
      code: "custom",
      path: ["hex"],
      message: "--hex/--file are only valid with --create",
    });
  }
}
