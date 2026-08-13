import { utils as tronUtils } from "tronweb";
import { ChainError } from "../../../../domain/errors/index.js";
import type { TronTransactionArtifact } from "../../../../domain/types/index.js";

const MAX_TRANSACTION_BYTES = 512 * 1024;
const SIGNATURE_BYTES = 65;

interface ProtobufTransaction {
  serializeBinary(): Uint8Array;
  getRawData(): {
    serializeBinary(): Uint8Array;
    getContractList(): Array<{ getType(): number }>;
  };
  getSignatureList_asU8(): Uint8Array[];
  addSignature(value: Uint8Array): unknown;
}

interface TransactionProtoConstructor {
  deserializeBinary(bytes: Uint8Array): ProtobufTransaction;
}

const CONTRACT_TYPE_BY_ID: Readonly<Record<number, string>> = Object.freeze({
  0: "AccountCreateContract",
  1: "TransferContract",
  2: "TransferAssetContract",
  4: "VoteWitnessContract",
  5: "WitnessCreateContract",
  6: "AssetIssueContract",
  8: "WitnessUpdateContract",
  9: "ParticipateAssetIssueContract",
  10: "AccountUpdateContract",
  11: "FreezeBalanceContract",
  12: "UnfreezeBalanceContract",
  13: "WithdrawBalanceContract",
  14: "UnfreezeAssetContract",
  15: "UpdateAssetContract",
  16: "ProposalCreateContract",
  17: "ProposalApproveContract",
  18: "ProposalDeleteContract",
  19: "SetAccountIdContract",
  30: "CreateSmartContract",
  31: "TriggerSmartContract",
  33: "UpdateSettingContract",
  41: "ExchangeCreateContract",
  42: "ExchangeInjectContract",
  43: "ExchangeWithdrawContract",
  44: "ExchangeTransactionContract",
  45: "UpdateEnergyLimitContract",
  46: "AccountPermissionUpdateContract",
  48: "ClearABIContract",
  49: "UpdateBrokerageContract",
  52: "MarketSellAssetContract",
  53: "MarketCancelOrderContract",
  54: "FreezeBalanceV2Contract",
  55: "UnfreezeBalanceV2Contract",
  56: "WithdrawExpireUnfreezeContract",
  57: "DelegateResourceContract",
  58: "UnDelegateResourceContract",
  59: "CancelAllUnfreezeV2Contract",
});

function invalidTransaction(message: string): never {
  throw new ChainError("invalid_transaction", message);
}

function normalizeHash(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(value)) {
    return invalidTransaction(`${field} must be a 32-byte hex value`);
  }
  return value.replace(/^0x/i, "").toLowerCase();
}

function transactionProto(): TransactionProtoConstructor {
  const proto = (globalThis as typeof globalThis & {
    TronWebProto?: { Transaction?: TransactionProtoConstructor };
  }).TronWebProto?.Transaction;
  if (!proto) {
    throw new ChainError(
      "provider_error",
      "the installed TronWeb version does not expose the transaction protobuf codec",
    );
  }
  return proto;
}

/** Bound and normalize untrusted protocol.Transaction hex before allocation or parsing. */
export function normalizeTransactionHex(input: string): string {
  if (typeof input !== "string") return invalidTransaction("transaction hex must be text");
  const normalized = input.trim().replace(/^0x/i, "");
  if (normalized.length === 0) return invalidTransaction("transaction hex is empty");
  if (normalized.length % 2 !== 0) return invalidTransaction("transaction hex must have an even length");
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    return invalidTransaction("transaction hex contains non-hex characters");
  }
  if (normalized.length / 2 > MAX_TRANSACTION_BYTES) {
    return invalidTransaction("transaction hex exceeds the 512 KiB limit");
  }
  return normalized.toLowerCase();
}

function appendSignatures(pb: ProtobufTransaction, signatures: unknown): void {
  if (signatures === undefined) return;
  if (!Array.isArray(signatures)) return invalidTransaction("transaction signatures must be an array");
  for (const signature of signatures) {
    if (typeof signature !== "string" || !/^(?:0x)?[0-9a-fA-F]+$/.test(signature)) {
      return invalidTransaction("transaction signature must be hex");
    }
    const normalized = signature.replace(/^0x/i, "");
    if (normalized.length !== SIGNATURE_BYTES * 2) {
      return invalidTransaction("transaction signature must be exactly 65 bytes");
    }
    pb.addSignature(Uint8Array.from(Buffer.from(normalized, "hex")));
  }
}

/** Encode JSON into complete protocol.Transaction bytes, preserving existing signatures. */
export function encodeTransactionHex(transaction: unknown): string {
  if (!transaction || typeof transaction !== "object") {
    return invalidTransaction("transaction must be an object");
  }
  const candidate = transaction as Partial<TronTransactionArtifact>;
  if (!candidate.raw_data || !Array.isArray(candidate.raw_data.contract) || candidate.raw_data.contract.length !== 1) {
    return invalidTransaction("exactly one contract is required per transaction");
  }
  let pb: ProtobufTransaction;
  try {
    pb = tronUtils.transaction.txJsonToPb(candidate) as ProtobufTransaction;
  } catch {
    return invalidTransaction("transaction JSON cannot be encoded as TRON protobuf");
  }

  const computedRawDataHex = tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase();
  const computedTxId = tronUtils.transaction.txPbToTxID(pb).replace(/^0x/i, "").toLowerCase();
  if (candidate.raw_data_hex !== undefined) {
    const suppliedRawDataHex = normalizeTransactionHex(candidate.raw_data_hex);
    if (suppliedRawDataHex !== computedRawDataHex) {
      return invalidTransaction("raw_data_hex does not match raw_data");
    }
  }
  if (candidate.txID !== undefined && normalizeHash(candidate.txID, "txID") !== computedTxId) {
    return invalidTransaction("txID does not match raw_data");
  }

  appendSignatures(pb, candidate.signature);
  const encoded = Buffer.from(pb.serializeBinary()).toString("hex").toLowerCase();
  if (encoded.length / 2 > MAX_TRANSACTION_BYTES) {
    return invalidTransaction("encoded transaction exceeds the 512 KiB limit");
  }
  return encoded;
}

/**
 * Decode complete protocol.Transaction bytes without accepting lossy reconstruction.
 * Unknown protobuf fields, multiple contracts, and unsupported contract types fail closed.
 */
export function decodeTransactionHex(input: string): TronTransactionArtifact {
  const normalized = normalizeTransactionHex(input);
  let pb: ProtobufTransaction;
  try {
    pb = transactionProto().deserializeBinary(Uint8Array.from(Buffer.from(normalized, "hex")));
  } catch {
    return invalidTransaction("transaction protobuf cannot be decoded");
  }

  const raw = pb.getRawData();
  const contracts = raw?.getContractList?.() ?? [];
  if (contracts.length !== 1) {
    return invalidTransaction("exactly one contract is required per transaction");
  }
  const contractType = CONTRACT_TYPE_BY_ID[contracts[0]!.getType()];
  if (!contractType) {
    return invalidTransaction(`unsupported TRON contract type id ${contracts[0]!.getType()}`);
  }

  const rawDataHex = Buffer.from(raw.serializeBinary()).toString("hex").toLowerCase();
  let rawData: TronTransactionArtifact["raw_data"];
  try {
    rawData = tronUtils.deserializeTx.deserializeTransaction(contractType, rawDataHex) as TronTransactionArtifact["raw_data"];
  } catch {
    return invalidTransaction(`TRON contract type ${contractType} cannot be decoded losslessly`);
  }
  const txID = tronUtils.transaction.txPbToTxID(pb).replace(/^0x/i, "").toLowerCase();
  const signature = pb.getSignatureList_asU8().map((value) => Buffer.from(value).toString("hex").toLowerCase());
  if (signature.some((value) => value.length !== SIGNATURE_BYTES * 2)) {
    return invalidTransaction("transaction contains a malformed signature");
  }

  const transaction: TronTransactionArtifact = {
    visible: false,
    txID,
    raw_data: rawData,
    raw_data_hex: rawDataHex,
    ...(signature.length > 0 ? { signature } : {}),
  };
  if (encodeTransactionHex(transaction) !== normalized) {
    return invalidTransaction("transaction cannot be represented losslessly by this client");
  }
  return transaction;
}

/** Recompute txID and raw_data_hex after a deliberate unsigned raw_data mutation. */
export function refreshTransactionIdentity(transaction: unknown): TronTransactionArtifact {
  if (!transaction || typeof transaction !== "object") {
    return invalidTransaction("transaction must be an object");
  }
  const candidate = transaction as Partial<TronTransactionArtifact>;
  if (Array.isArray(candidate.signature) && candidate.signature.length > 0) {
    return invalidTransaction("a signed transaction cannot be mutated");
  }
  let pb: ProtobufTransaction;
  try {
    pb = tronUtils.transaction.txJsonToPb(candidate) as ProtobufTransaction;
  } catch {
    return invalidTransaction("transaction JSON cannot be encoded as TRON protobuf");
  }
  const refreshed: TronTransactionArtifact = {
    ...(candidate as TronTransactionArtifact),
    visible: false,
    txID: tronUtils.transaction.txPbToTxID(pb).replace(/^0x/i, "").toLowerCase(),
    raw_data_hex: tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase(),
  };
  decodeTransactionHex(encodeTransactionHex(refreshed));
  return refreshed;
}
