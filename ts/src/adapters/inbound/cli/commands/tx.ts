import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { TronProtocolValue } from "../../../../domain/types/index.js";
import type { TronTransactionService } from "../../../../application/use-cases/tron/transaction-service.js";
import type { EvmTransactionService } from "../../../../application/use-cases/evm/transaction-service.js";
import { gweiToWei } from "../../../../domain/evm/evm-gas.js";
import type { TronSigService } from "../../../../application/use-cases/tron/sig-service.js";
import type { TronMultisigService } from "../../../../application/use-cases/tron/multisig-service.js";
import type { TronMultisigCollaborationService } from "../../../../application/use-cases/tron/multisig-collaboration-service.js";
import { Schemas, addressFieldsFor } from "../schemas/index.js";
import { tronTxModeFields, txModeFields, unifiedAmountFields, txModeExclusive } from "./shared.js";
import { TextFormatters } from "../render/index.js";
import { exactlyOne, readBoundedTextFile } from "./artifact.js";
import { txHashInputPattern } from "../../../../domain/family/index.js";
import { sunAmount } from "../../../../domain/amounts/index.js";
import { DEFAULT_FEE_LIMIT_SUN } from "../../../../domain/fees/tron.js";

const sendFields = z.object({
  to: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe("recipient address for the selected network, or a local contact name"),
  token: z.string().min(1).optional().describe("token symbol from the address book"),
  contract: Schemas.address()
    .optional()
    .describe("token contract address; omit for a native-coin transfer"),
  ...unifiedAmountFields(
    "human amount: native coin for native transfers, token units for token transfers",
    "raw integer amount in native base units or token base units",
  ),
  ...txModeFields,
});

export const txSendSpec: ChainSpec = {
  path: ["tx", "send"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "tx.send",
  summary: "Send native coins or tokens with human --amount",
  description:
    "Send the native coin, or a token selected with --token / --contract.\n" +
    "Flags marked (TRON only) or (EVM only) are accepted only on networks of that family; using one on the other family is rejected.",
  baseFields: sendFields,
  exclusive: [
    { label: "the amount to send", flags: ["amount", "raw-amount"], select: "exactly-one" },
    {
      label: "which asset to send; omit for the network's native coin",
      flags: ["token", "contract", "asset-id"],
      select: "at-most-one",
    },
    txModeExclusive,
  ],
  examples: [
    { cmd: "wallet-cli tx send --to T... --amount 1 --network nile" },
    { cmd: "wallet-cli tx send --to 0x742d... --amount 1 --network sepolia" },
    { cmd: "wallet-cli tx send --to T... --token USDT --amount 5 --network nile" },
    { cmd: "wallet-cli tx send --to 0x742d... --token USDC --amount 5 --network sepolia" },
    { cmd: "wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000 --network nile" },
  ],
  formatText: TextFormatters.txReceipt,
};

const tronSendFields = z.object({
  assetId: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe("TRC10 numeric asset id; omit with --contract for native TRX"),
  feeLimit: Schemas.positiveIntString()
    .default(DEFAULT_FEE_LIMIT_SUN)
    .describe("maximum TRX energy fee to burn for TRC20 transfers, in SUN"),
  ...tronTxModeFields,
});

const evmSendFields = z.object({
  gasLimit: Schemas.positiveIntString()
    .optional()
    .describe("gas units to authorise; defaults to the node's estimate, unpadded"),
  maxFee: z
    .string()
    .optional()
    .describe("maximum total fee per gas, in gwei — 25 or 25gwei (EIP-1559 chains only)"),
  priorityFee: z
    .string()
    .optional()
    .describe("tip per gas paid to the proposer, in gwei — 25 or 25gwei (EIP-1559 chains only)"),
  nonce: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("transaction nonce; defaults to the account's pending nonce"),
});

function evmHexOnly(
  input: { transaction?: string; hex?: string; file?: string },
  hasStdin = false,
): string {
  // Reject the TRON JSON stdin channel instead of ignoring its payload.
  if (hasStdin) {
    throw new UsageError(
      "invalid_option",
      "--tx-stdin carries the TRON JSON form; on an EVM network pass raw hex with --hex or --file",
    );
  }
  return hexInput(input);
}

export const txSignEvmBinding = (svc: EvmTransactionService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.sign(ctx, net, evmHexOnly(input), input.out),
});

export const txBroadcastEvmBinding = (svc: EvmTransactionService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    return svc.broadcast(ctx, net, evmHexOnly(input, ctx.secrets.has("tx")), input.dryRun === true);
  },
});

export const txSendEvmBinding = (svc: EvmTransactionService): FamilyBinding => ({
  fields: evmSendFields,
  refine: addressFieldsFor("evm", "contract"),
  run: async (ctx, net, input) =>
    svc.send(ctx, net, {
      ...input,
      // CLI fees are in gwei; service fees are in wei.
      ...(input.maxFee === undefined ? {} : { maxFee: gweiToWei(input.maxFee) }),
      ...(input.priorityFee === undefined ? {} : { priorityFee: gweiToWei(input.priorityFee) }),
    }),
});

export const txSendTronBinding = (svc: TronTransactionService): FamilyBinding => ({
  fields: tronSendFields,
  refine: addressFieldsFor("tron", "contract"),
  run: async (ctx, net, input) =>
    svc.send(ctx, net, { ...input, feeLimit: sunAmount(input.feeLimit) }),
});

const tronBroadcastFields = z.object({
  transaction: z.string().optional().describe("signed transaction JSON"),
});

const broadcastFields = z.object({
  hex: z
    .string()
    .min(2)
    .optional()
    .describe("signed transaction hex: protobuf hex for TRON, RLP for EVM"),
  file: z.string().min(1).optional().describe("file containing the signed transaction hex"),
  dryRun: z
    .boolean()
    .default(false)
    .describe(
      "validate signatures, threshold, expiration, and dynamic multi-sign fee without broadcasting",
    ),
});

export const txBroadcastSpec: ChainSpec = {
  path: ["tx", "broadcast"],
  stdin: "tx",
  stdinFamily: "tron",
  network: "optional",
  wallet: "none",
  auth: "none",
  broadcasts: true,
  capability: "tx.broadcast",
  summary: "Broadcast a presigned transaction",
  description:
    "Broadcast an already-signed transaction. It must have been built for the network you\n" +
    "select — one built for another chain is rejected before it is sent.",
  baseFields: broadcastFields,
  exclusive: [
    {
      label: "the signed transaction to broadcast",
      flags: ["transaction", "tx-stdin", "hex", "file"],
    },
  ],
  examples: [
    { cmd: "wallet-cli tx broadcast --file signed.hex --network nile" },
    { cmd: "wallet-cli tx broadcast --file signed.hex --network sepolia" },
    { cmd: "wallet-cli tx broadcast --tx-stdin < signed.json --network nile" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const txBroadcastTronBinding = (service: TronMultisigService): FamilyBinding => ({
  fields: tronBroadcastFields,
  run: async (ctx, net, input) => {
    const stdin = ctx.secrets.has("tx");
    exactlyOne(
      [input.transaction, stdin ? true : undefined, input.hex, input.file],
      "provide exactly one of --transaction, --tx-stdin, --hex, or --file",
    );
    if (input.hex || input.file) {
      const hex =
        input.hex ?? readBoundedTextFile(input.file, 1024 * 1024 + 4096, "transaction hex file");
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
  hex: z.string().min(2).optional().describe("transaction hex: protobuf hex for TRON, RLP for EVM"),
  file: z.string().min(1).optional().describe("file containing the transaction hex"),
};

const approvalsFields = z.object(artifactFields);

export const txApprovalsSpec: ChainSpec = {
  path: ["tx", "approvals"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "tx.multisig.local",
  summary: "Show collected signatures on a multi-sig transaction",
  description:
    "Inspect the transaction, selected permission group, approved signers, accumulated weight, missing weight, and expiration without signing.",
  baseFields: approvalsFields,
  exclusive: [{ label: "the transaction to inspect", flags: ["hex", "file"] }],
  examples: [{ cmd: "wallet-cli tx approvals --file partially-signed.hex" }],
  formatText: TextFormatters.txApprovals,
};

export const txApprovalsTronBinding = (service: TronMultisigService): FamilyBinding => ({
  run: async (ctx, network, input) => service.approvals(ctx.deadline, network, hexInput(input)),
});

const tronSignFields = z.object({
  transaction: z
    .string()
    .min(1)
    .optional()
    .describe("unsigned transaction JSON; TRON compatibility path, never checked online"),
});

const signFields = z.object({
  ...artifactFields,
  offline: z
    .boolean()
    .default(false)
    .describe(
      "sign locally without contacting a node; skips the signer-permission and approval-weight checks",
    ),
  out: z
    .string()
    .min(1)
    .optional()
    .describe("atomically write co-signed transaction hex to this file"),
});

export const txSignSpec: ChainSpec = {
  path: ["tx", "sign"],
  network: "optional",
  wallet: "optional",
  auth: "required",
  broadcasts: false,
  capability: "tx.sign",
  summary: "Sign a transaction built elsewhere",
  description:
    "Sign a transaction that was built elsewhere and output the signed result; broadcast it\n" +
    "later with `tx broadcast`. A transaction built for another network is rejected before it\n" +
    "is signed.\n" +
    "On TRON, --hex/--file append one signature to those already collected and report the\n" +
    "resulting approval weight; --offline skips the online permission checks. An EVM\n" +
    "transaction carries exactly one signature, so an already-signed one is refused.",
  baseFields: signFields,
  exclusive: [{ label: "the transaction to co-sign", flags: ["hex", "file", "transaction"] }],
  examples: [
    {
      cmd: `wallet-cli tx sign --transaction '{"txID":"...","raw_data":{...},"raw_data_hex":"..."}'`,
    },
    {
      cmd: "wallet-cli tx sign --file unsigned.hex --out signed.hex --network nile --password-stdin",
    },
    {
      cmd: "wallet-cli tx sign --file unsigned.hex --out signed.hex --network sepolia --password-stdin",
    },
    { cmd: "wallet-cli tx sign --file partially-signed.hex --offline --password-stdin" },
  ],
  formatText: TextFormatters.txSign,
};

export const txSignTronBinding = (
  signingService: TronSigService,
  multisigService: TronMultisigService,
): FamilyBinding => ({
  fields: tronSignFields,
  refine: (input, context) => {
    if (input.out && input.transaction) {
      context.addIssue({
        code: "custom",
        path: ["out"],
        message: "--out is only valid with --hex or --file",
      });
    }
    if (input.offline && input.transaction) {
      context.addIssue({
        code: "custom",
        path: ["offline"],
        message: "--offline is only valid with --hex or --file",
      });
    }
  },
  run: async (ctx, net, input) => {
    if (!input.transaction) {
      const hex = hexInput(input);
      return input.offline
        ? signingService.sign(ctx, net, hex, { origin: "offline" }, input.out)
        : multisigService.signChecked(ctx, net, hex, input.out);
    }
    if (input.out)
      throw new UsageError("invalid_option", "--out is only valid with --hex or --file");
    if (input.offline)
      throw new UsageError("invalid_option", "--offline is only valid with --hex or --file");
    let tx: TronProtocolValue;
    try {
      tx = JSON.parse(input.transaction) as TronProtocolValue;
    } catch {
      throw new UsageError("invalid_value", "TRON transaction must be JSON");
    }
    return signingService.signJson(ctx, net, tx, { origin: "offline" });
  },
});

const tronLinkMultisigFields = z.object({
  create: z
    .boolean()
    .default(false)
    .describe("sign one unsigned transaction and open a TronLink signature collection with it"),
  hex: z
    .string()
    .min(2)
    .optional()
    .describe("unsigned protocol.Transaction hex used with --create"),
  file: z
    .string()
    .min(1)
    .optional()
    .describe("file containing unsigned transaction hex used with --create"),
  sign: z
    .string()
    .regex(txHashInputPattern("tron"))
    .optional()
    .describe("fetch and co-sign one pending TronLink transaction by txId"),
  watch: z
    .boolean()
    .default(false)
    .describe(
      "keep a WebSocket open and report only the count of transactions awaiting this account",
    ),
});

export const txTronLinkMultisigSpec: ChainSpec = {
  path: ["tx", "multisig"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  rejectsWait: "the collection is managed by TronLink and follows its own workflow",
  capability: "tx.multisig.tronlink",
  summary: "Create / co-sign a multi-sig transaction",
  description:
    "With no mode flag, list service-managed transactions for the selected account. --create signs\n" +
    "an UNSIGNED transaction locally and submits it, which opens the collection at the first\n" +
    "signature; --sign fetches the accumulated transaction, signs locally, and submits it;\n" +
    "--watch opens the official WebSocket count-only notification channel.",
  requires: [
    "TronLink service credentials — config tronlinkSecretId / tronlinkSecretKey / tronlinkChannel",
  ],
  baseFields: tronLinkMultisigFields,
  exclusive: [
    {
      label: "which mode to run; omit all three to list",
      flags: ["create", "sign", "watch"],
      select: "at-most-one",
    },
  ],
  baseRefine: tronLinkMultisigRefine,
  examples: [
    { cmd: "wallet-cli tx multisig" },
    { cmd: "wallet-cli tx multisig --create --file tx.unsigned.hex --password-stdin" },
    { cmd: "wallet-cli tx multisig --sign 9c1... --password-stdin" },
    { cmd: "wallet-cli tx multisig --watch" },
  ],
  formatText: TextFormatters.txTronLinkMultisig,
};

export const txTronLinkMultisigBinding = (
  service: TronMultisigCollaborationService,
): FamilyBinding => ({
  run: async (ctx, network, input) => {
    const address = ctx.resolveAddress("tron");
    if (input.create) return service.create(ctx, network, hexInput(input));
    if (input.sign) return service.sign(ctx, network, input.sign);
    if (!input.watch) return service.list(ctx.deadline, network, address);

    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    ctx.streams.event(`Watching TronLink multi-sig service for ${network.id} … (Ctrl-C to stop)`);
    try {
      return await service.watch(ctx.deadline, network, address, controller.signal, (count) => {
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

const statusFields = z.object({ txid: z.string().min(1).describe("transaction id/hash") });

export const txStatusSpec: ChainSpec = {
  path: ["tx", "status"],
  network: "optional",
  wallet: "none",
  auth: "none",
  summary: "Show confirmation status of a transaction",
  baseFields: statusFields,
  examples: [
    { cmd: "wallet-cli tx status --txid abc123 --network nile" },
    { cmd: "wallet-cli tx status --txid 0x9c4e... --network sepolia" },
  ],
  formatText: TextFormatters.txStatus,
};

export const txStatusTronBinding = (svc: TronTransactionService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.status(ctx.deadline, net, input.txid),
});

export const txStatusEvmBinding = (svc: EvmTransactionService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.status(ctx, net, input.txid),
});

const infoFields = z.object({ txid: z.string().min(1).describe("transaction id/hash") });

export const txInfoSpec: ChainSpec = {
  path: ["tx", "info"],
  network: "optional",
  wallet: "none",
  auth: "none",
  summary: "Show full transaction detail + receipt",
  baseFields: infoFields,
  examples: [
    { cmd: "wallet-cli tx info --txid abc123 --network nile" },
    { cmd: "wallet-cli tx info --txid 0x9c4e... --network sepolia" },
  ],
  formatText: TextFormatters.txInfo,
};

export const txInfoTronBinding = (svc: TronTransactionService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.info(ctx.deadline, net, input.txid),
});

export const txInfoEvmBinding = (svc: EvmTransactionService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.info(ctx, net, input.txid),
});

function hexInput(input: { hex?: string; file?: string }): string {
  exactlyOne([input.hex, input.file], "provide exactly one of --hex or --file");
  return input.hex ?? readBoundedTextFile(input.file!, 1024 * 1024 + 4096, "transaction hex file");
}

function tronLinkMultisigRefine(
  value: z.infer<typeof tronLinkMultisigFields>,
  context: z.RefinementCtx,
): void {
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
