// Bind txID to raw_data_hex, then verify declared contract types and encodable JSON fields.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { ChainError } from "../../../../domain/errors/index.js";
import { rawDataHexOf } from "./transaction-codec.js";

const UNSUPPORTED_CONTRACT_TYPE = /^Unsupported transaction type/i;

interface TronProto {
  Transaction: {
    raw: { deserializeBinary(bytes: Uint8Array): { getContractList(): { getType(): number }[] } };
    Contract: { ContractType: Record<string, number> };
  };
}

let contractTypeMap: Map<string, number> | undefined;
function contractTypeByName(proto: TronProto): Map<string, number> {
  if (!contractTypeMap) {
    contractTypeMap = new Map();
    for (const [name, num] of Object.entries(proto.Transaction.Contract.ContractType)) {
      contractTypeMap.set(name.toUpperCase(), num);
    }
  }
  return contractTypeMap;
}

// The outer envelope remains decodable even when a contract payload cannot be re-encoded.
function assertContractTypeBinding(rawData: unknown, rawDataHex: string): void {
  // TronWeb exposes protobuf definitions on globalThis when imported.
  const proto = (globalThis as { TronWebProto?: TronProto }).TronWebProto;
  if (!proto)
    throw new ChainError(
      "tx_integrity",
      "TRON protobuf definitions are unavailable; refusing to sign",
    );

  let encoded: number[];
  try {
    const raw = proto.Transaction.raw.deserializeBinary(hexToBytes(rawDataHex.replace(/^0x/, "")));
    encoded = raw.getContractList().map((c) => c.getType());
  } catch (e) {
    throw new ChainError(
      "tx_integrity",
      `TRON transaction raw_data_hex is not a decodable transaction: ${(e as Error).message}`,
    );
  }

  const byName = contractTypeByName(proto);
  const contracts = Array.isArray((rawData as { contract?: unknown }).contract)
    ? (rawData as { contract: unknown[] }).contract
    : [];
  const declared = contracts.map((c) => {
    const name =
      typeof (c as { type?: unknown })?.type === "string"
        ? (c as { type: string }).type.toUpperCase()
        : "";
    const num = byName.get(name);
    if (num === undefined) {
      throw new ChainError(
        "tx_integrity",
        `TRON transaction declares an unknown contract type "${(c as { type?: unknown })?.type}"; refusing to sign`,
      );
    }
    return num;
  });

  if (declared.length !== encoded.length || declared.some((n, i) => n !== encoded[i])) {
    throw new ChainError(
      "tx_integrity",
      "TRON transaction raw_data contract type does not match its raw_data_hex; refusing to sign",
    );
  }
}

export function assertTronTxIntegrity(tx: unknown): void {
  const t = tx as { raw_data?: unknown; raw_data_hex?: unknown; txID?: unknown };
  if (
    !t ||
    typeof t !== "object" ||
    !t.raw_data ||
    typeof t.raw_data_hex !== "string" ||
    typeof t.txID !== "string"
  ) {
    throw new ChainError(
      "tx_integrity",
      "TRON transaction must carry raw_data, raw_data_hex and txID; refusing to sign",
    );
  }

  const claimed = t.txID.replace(/^0x/, "").toLowerCase();
  let derived: string;
  try {
    derived = bytesToHex(sha256(hexToBytes(t.raw_data_hex.replace(/^0x/, ""))));
  } catch (e) {
    throw new ChainError(
      "tx_integrity",
      `TRON transaction raw_data_hex is not valid hex: ${(e as Error).message}`,
    );
  }
  if (derived !== claimed) {
    throw new ChainError(
      "tx_integrity",
      "TRON transaction txID is not the hash of its raw_data_hex; refusing to sign",
    );
  }

  assertContractTypeBinding(t.raw_data, t.raw_data_hex);

  let matchesRawData: boolean;
  try {
    // Use the builders' codec overrides so verification compares the same serialization.
    matchesRawData = rawDataHexOf(tx) === t.raw_data_hex.replace(/^0x/, "").toLowerCase();
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    // Unsupported types retain hash/type checks, but their JSON field values remain unverified.
    if (UNSUPPORTED_CONTRACT_TYPE.test(message)) return;
    // Any other encoding failure must refuse signing.
    throw new ChainError(
      "tx_integrity",
      `TRON transaction raw_data could not be re-encoded for verification: ${message}`,
    );
  }
  if (!matchesRawData) {
    throw new ChainError(
      "tx_integrity",
      "TRON transaction raw_data does not match its raw_data_hex; refusing to sign",
    );
  }
}
