// Tolerate malformed optional fields; keep the node's JSON verbatim as the raw display value.
import { z } from "zod";
import { ChainError } from "../../../../domain/errors/index.js";
import { sunAmount, type Sun } from "../../../../domain/amounts/index.js";
import type {
  TronExecution,
  TronInternalTransaction,
  TronRawTransaction,
  TronRawTxInfo,
  TronTx,
  TronTxInfo,
  TronTxLog,
} from "../../../../application/ports/chain/tron-gateway.js";
import { decodeTronTransaction } from "./transaction-decoder.js";

type Json = Record<string, unknown>;

const record = (value: unknown): Json | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

// An integer beyond 2^53 is rejected rather than rounded; other malformed values read as absent.
function safeInteger(value: unknown, field: string): number | undefined {
  let parsed: number | undefined;
  if (typeof value === "number" && Number.isInteger(value)) parsed = value;
  else if (typeof value === "string" && /^\d+$/.test(value)) parsed = Number(value);
  if (parsed === undefined || parsed < 0) return undefined;
  if (!Number.isSafeInteger(parsed)) {
    throw new ChainError("provider_error", `TRON node returned an imprecise ${field}`);
  }
  return parsed;
}

function decimalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === "string" && /^\d+$/.test(value) ? value : undefined;
}

function sunString(value: unknown): Sun | undefined {
  const text = decimalString(value);
  return text === undefined ? undefined : sunAmount(text);
}

// A malformed element voids the whole list, so decoders never act on partial evidence.
function list<T>(value: unknown, item: (entry: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: T[] = [];
  for (const entry of value) {
    const parsed = item(entry);
    if (parsed === undefined) return undefined;
    items.push(parsed);
  }
  return items;
}

const presentAndNot = (value: unknown, type: "string" | "boolean") =>
  value !== undefined && typeof value !== type;

function log(entry: unknown): TronTxLog | undefined {
  const value = record(entry);
  if (!value || presentAndNot(value.address, "string") || presentAndNot(value.data, "string")) {
    return undefined;
  }
  const topics = value.topics === undefined ? undefined : list(value.topics, optionalString);
  if (value.topics !== undefined && topics === undefined) return undefined;
  return {
    ...(value.address === undefined ? {} : { address: value.address as string }),
    ...(topics === undefined ? {} : { topics }),
    ...(value.data === undefined ? {} : { data: value.data as string }),
  };
}

function callValue(entry: unknown): { callValue?: string; tokenId?: string } | undefined {
  const value = record(entry);
  if (!value || presentAndNot(value.tokenId, "string")) return undefined;
  const amount = value.callValue === undefined ? undefined : decimalString(value.callValue);
  if (value.callValue !== undefined && amount === undefined) return undefined;
  return {
    ...(amount === undefined ? {} : { callValue: amount }),
    ...(value.tokenId === undefined ? {} : { tokenId: value.tokenId as string }),
  };
}

function internalTransaction(entry: unknown): TronInternalTransaction | undefined {
  const value = record(entry);
  if (
    !value ||
    presentAndNot(value.caller_address, "string") ||
    presentAndNot(value.transferTo_address, "string") ||
    presentAndNot(value.rejected, "boolean")
  ) {
    return undefined;
  }
  const values =
    value.callValueInfo === undefined ? undefined : list(value.callValueInfo, callValue);
  if (value.callValueInfo !== undefined && values === undefined) return undefined;
  return {
    ...(value.caller_address === undefined
      ? {}
      : { caller_address: value.caller_address as string }),
    ...(value.transferTo_address === undefined
      ? {}
      : { transferTo_address: value.transferTo_address as string }),
    ...(value.rejected === undefined ? {} : { rejected: value.rejected as boolean }),
    ...(values === undefined ? {} : { callValueInfo: values }),
  };
}

// Top-level result FAILED or a receipt failure code is authoritative; DEFAULT is no result.
function executionOf(
  topLevel: unknown,
  receiptResult: string | undefined,
): { execution: TronExecution; failureReason?: string } {
  const receiptFailed =
    receiptResult !== undefined && receiptResult !== "SUCCESS" && receiptResult !== "DEFAULT";
  if (receiptFailed) return { execution: "failed", failureReason: receiptResult };
  if (topLevel === "FAILED") return { execution: "failed", failureReason: "FAILED" };
  return { execution: receiptResult === "SUCCESS" ? "success" : "unknown" };
}

// Expects safe integers as numbers and larger integers as exact decimal strings.
export function parseTronTxInfo(raw: unknown): TronTxInfo {
  const info = record(raw) ?? {};
  const receipt = record(info.receipt) ?? {};
  // Numeric results stay visible as strings so they cannot be mistaken for an absent result.
  const receiptResult =
    typeof receipt.result === "string" || typeof receipt.result === "number"
      ? String(receipt.result)
      : undefined;
  return {
    blockNumber: safeInteger(info.blockNumber, "blockNumber"),
    ...executionOf(info.result, receiptResult),
    receiptResult,
    feeSun: safeInteger(info.fee, "fee"),
    energyUsed: safeInteger(receipt.energy_usage_total, "energy_usage_total"),
    energyFeeSun: safeInteger(receipt.energy_fee, "energy_fee"),
    netUsed: safeInteger(receipt.net_usage, "net_usage"),
    netFeeSun: safeInteger(receipt.net_fee, "net_fee"),
    withdrawnSun: sunString(info.withdraw_amount),
    unfreezeAmount: sunString(info.unfreeze_amount),
    // TRON's HTTP mapping uses camelCase for assetIssueID.
    assetIssueId: optionalString(info.assetIssueID),
    exchangeId: safeInteger(info.exchange_id, "exchange_id"),
    exchangeReceived: decimalString(info.exchange_received_amount),
    exchangeInjectedOther: decimalString(info.exchange_inject_another_amount),
    exchangeWithdrawnOther: decimalString(info.exchange_withdraw_another_amount),
    contractResult: list(info.contractResult, optionalString),
    log: list(info.log, log),
    internal_transactions: list(info.internal_transactions, internalTransaction),
    raw: info as unknown as TronRawTxInfo,
  };
}

const optStr = z.string().optional().catch(undefined);

const TronContractSchema = z.looseObject({
  type: optStr,
  parameter: z
    .looseObject({
      value: z.looseObject({}).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const TronTxSchema = z.preprocess(
  (value) => (value && typeof value === "object" ? value : {}),
  z.looseObject({
    txID: optStr,
    ret: z
      .array(z.looseObject({ contractRet: optStr }))
      .optional()
      .catch(undefined),
    raw_data: z
      .looseObject({ contract: z.array(TronContractSchema).optional().catch(undefined) })
      .optional()
      .catch(undefined),
  }),
);

export function parseTronTx(raw: unknown): TronTx {
  const transaction = TronTxSchema.parse(raw);
  return {
    txId: transaction.txID,
    contractResult: transaction.ret?.[0]?.contractRet,
    parties: decodeTronTransaction(transaction),
    raw: (record(raw) ?? {}) as unknown as TronRawTransaction,
  };
}
