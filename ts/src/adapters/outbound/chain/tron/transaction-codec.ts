import { utils as tronUtils } from "tronweb";
import { ChainError } from "../../../../domain/errors/index.js";
import type { TronTransactionArtifact } from "../../../../domain/types/index.js";
import { decodeOverriddenContract, encodeOverriddenContract } from "./asset-contract-codec.js";
import {
  proposalCreateTxJsonToPbExact,
  updateEnergyLimitTxJsonToPbExact,
} from "./proposal-protobuf.js";

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
  // 51/52/53 are named but NOT decodable by the bundled TronWeb (its deserializer throws
  // "not supported"). They stay in the table so an artifact carrying one is refused as
  // "<name> cannot be decoded losslessly" rather than the opaque "unsupported contract type id".
  // (14 was in this group until asset-contract-codec.ts supplied the missing serialiser.)
  51: "ShieldedTransferContract",
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
  const proto = (
    globalThis as typeof globalThis & {
      TronWebProto?: { Transaction?: TransactionProtoConstructor };
    }
  ).TronWebProto?.Transaction;
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
  if (normalized.length % 2 !== 0)
    return invalidTransaction("transaction hex must have an even length");
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
  if (!Array.isArray(signatures))
    return invalidTransaction("transaction signatures must be an array");
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

const RESOURCE_CODE_NAMES: readonly string[] = ["BANDWIDTH", "ENERGY", "TRON_POWER"];

/**
 * TRON services (TronLink among them) render protobuf enums as their numeric value, while TronWeb's
 * encoder only understands the name and drops an unrecognized value *silently* — the re-encoded
 * bytes would then be missing the field and read as forged. Map it back to the name; the
 * raw_data_hex / txID equality checks below remain the arbiter of whether the result is accepted.
 */
function withNamedEnums(
  candidate: Partial<TronTransactionArtifact>,
): Partial<TronTransactionArtifact> {
  const contract = candidate.raw_data?.contract[0];
  const value = contract?.parameter?.value;
  const resource = value?.resource;
  if (typeof resource !== "number") return candidate;
  const name = RESOURCE_CODE_NAMES[resource];
  if (name === undefined) return candidate;
  return {
    ...candidate,
    raw_data: {
      ...candidate.raw_data!,
      contract: [
        {
          ...contract!,
          parameter: { ...contract!.parameter, value: { ...value, resource: name } },
        },
      ],
    },
  };
}

/**
 * Contract types TronWeb encodes WRONGLY, each routed to our own serialiser. Two families, one
 * table — see asset-contract-codec.ts (types TronWeb cannot represent at all) and
 * proposal-protobuf.ts (types it represents but narrows past int64 / applies obsolete policy caps).
 *
 * Keeping them in a single table is the point: the override must be reachable from every path that
 * produces protobuf, or one caller silently emits bytes that disagree with what was signed. That is
 * exactly how `--build-only` shipped broken for the governance commands.
 */
const GOVERNANCE_ENCODERS: Readonly<Record<string, (transaction: unknown) => unknown>> =
  Object.freeze({
    ProposalCreateContract: proposalCreateTxJsonToPbExact,
    UpdateEnergyLimitContract: updateEnergyLimitTxJsonToPbExact,
  });

function encodeOverridden(
  candidate: Partial<TronTransactionArtifact>,
): ProtobufTransaction | undefined {
  const type = candidate.raw_data?.contract?.[0]?.type;
  if (typeof type === "string") {
    const governance = GOVERNANCE_ENCODERS[type];
    if (governance) return governance(candidate) as ProtobufTransaction;
  }
  return encodeOverriddenContract(candidate) as unknown as ProtobufTransaction | undefined;
}

/**
 * TronWeb's JSON→protobuf encoder, with every contract type it gets wrong routed to our own
 * serialiser first. Every path that reaches protobuf goes through `encodeOverridden`, so the
 * override cannot be bypassed by one caller and silently corrupt a transaction.
 */
function toProtobuf(candidate: Partial<TronTransactionArtifact>): ProtobufTransaction {
  const overridden = encodeOverridden(candidate);
  if (overridden) return overridden;
  try {
    return tronUtils.transaction.txJsonToPb(candidate) as ProtobufTransaction;
  } catch {
    return invalidTransaction("transaction JSON cannot be encoded as TRON protobuf");
  }
}

/**
 * The raw_data_hex our encoder derives from a raw_data — the arbiter the integrity check compares
 * against. Deliberately lets encoding errors propagate so the caller can tell "this contract type
 * has no encoder" apart from "this payload is malformed".
 *
 * tx-integrity must go through here rather than tronweb's own `txCheck`: for the two contract
 * types we override, tronweb's re-encoding disagrees with the bytes we actually signed, and a
 * legitimate transaction would be refused (see asset-contract-codec.ts).
 */
export function rawDataHexOf(transaction: unknown): string {
  const candidate = withNamedEnums(transaction as Partial<TronTransactionArtifact>);
  const pb =
    encodeOverridden(candidate) ??
    (tronUtils.transaction.txJsonToPb(candidate) as ProtobufTransaction);
  return tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase();
}

/** Encode JSON into complete protocol.Transaction bytes, preserving existing signatures. */
export function encodeTransactionHex(transaction: unknown): string {
  if (!transaction || typeof transaction !== "object") {
    return invalidTransaction("transaction must be an object");
  }
  let candidate = transaction as Partial<TronTransactionArtifact>;
  if (
    !candidate.raw_data ||
    !Array.isArray(candidate.raw_data.contract) ||
    candidate.raw_data.contract.length !== 1
  ) {
    return invalidTransaction("exactly one contract is required per transaction");
  }
  candidate = withNamedEnums(candidate);
  const pb = toProtobuf(candidate);

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
  const overridden = decodeOverriddenContract(contractType, rawDataHex);
  if (overridden) {
    rawData = overridden;
  } else {
    try {
      rawData = tronUtils.deserializeTx.deserializeTransaction(
        contractType,
        rawDataHex,
      ) as TronTransactionArtifact["raw_data"];
    } catch {
      return invalidTransaction(`TRON contract type ${contractType} cannot be decoded losslessly`);
    }
  }
  const txID = tronUtils.transaction.txPbToTxID(pb).replace(/^0x/i, "").toLowerCase();
  const signature = pb
    .getSignatureList_asU8()
    .map((value) => Buffer.from(value).toString("hex").toLowerCase());
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

/**
 * TRON derives a deployed contract's address from the transaction that creates it:
 * `41 ‖ keccak256(txID ‖ owner_address)[12..]`. It is therefore part of the transaction identity,
 * not an independent field — any raw_data mutation moves the contract, so a carried-over
 * `contract_address` would name a contract that never gets deployed.
 */
function deriveContractAddress(
  txId: string,
  contract: { parameter?: { value?: Record<string, unknown> } },
): string {
  const owner = contract.parameter?.value?.owner_address;
  if (typeof owner !== "string" || !/^41[0-9a-fA-F]{40}$/.test(owner)) {
    return invalidTransaction("CreateSmartContract owner_address must be a 21-byte hex address");
  }
  const preimage = Uint8Array.from(
    (txId + owner.toLowerCase()).match(/../g)!.map((byte) => parseInt(byte, 16)),
  );
  return `41${tronUtils.ethersUtils.keccak256(preimage).slice(2).slice(24)}`;
}

/** Recompute txID, raw_data_hex, and any derived contract address after a deliberate unsigned
 *  raw_data mutation. */
export function refreshTransactionIdentity(transaction: unknown): TronTransactionArtifact {
  if (!transaction || typeof transaction !== "object") {
    return invalidTransaction("transaction must be an object");
  }
  const candidate = transaction as Partial<TronTransactionArtifact>;
  if (Array.isArray(candidate.signature) && candidate.signature.length > 0) {
    return invalidTransaction("a signed transaction cannot be mutated");
  }
  const pb = toProtobuf(candidate);
  const refreshed: TronTransactionArtifact = {
    ...(candidate as TronTransactionArtifact),
    visible: false,
    txID: tronUtils.transaction.txPbToTxID(pb).replace(/^0x/i, "").toLowerCase(),
    raw_data_hex: tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase(),
  };
  const deployment = refreshed.raw_data.contract[0];
  if (
    typeof refreshed.contract_address === "string" &&
    deployment?.type === "CreateSmartContract"
  ) {
    refreshed.contract_address = deriveContractAddress(refreshed.txID, deployment);
  }
  decodeTransactionHex(encodeTransactionHex(refreshed));
  return refreshed;
}
