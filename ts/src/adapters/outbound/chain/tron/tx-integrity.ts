/**
 * TRON transaction payload integrity — enforced before ANY signature is produced, by every
 * signing backend (software strategy and Ledger device alike).
 *
 * A TRON transaction states its content three times, and nothing in the format forces the three
 * to agree:
 *
 *   raw_data      the JSON a caller inspects when deciding whether to sign
 *   raw_data_hex  the protobuf bytes the node actually executes
 *   txID          sha256 of those bytes — and the ONLY thing that gets signed
 *                 (tronweb's crypto.signTransaction signs tx.txID verbatim, never recomputing it;
 *                  the Ledger app signs the raw_data_hex you hand it)
 *
 * So a caller-supplied transaction can display a harmless raw_data while carrying the txID and
 * raw_data_hex of a different one, and the resulting signature is perfectly valid for whatever
 * actually broadcasts.
 *
 * Two layers, because they close different holes and have different coverage:
 *
 *   1. txID === sha256(raw_data_hex) — the security-critical binding between the hash we sign and
 *      the bytes the node executes. Pure protocol arithmetic, so it holds for EVERY contract type,
 *      including ones no library can decode.
 *   1.5. contract-type binding — decode raw_data_hex's outer envelope (always decodable, even for
 *      contract types no library can *encode*) and confirm its contract type(s) equal the ones
 *      raw_data declares. This closes the gap layer 2 leaves for Market/Shielded: a caller-read
 *      raw_data cannot claim a benign type while raw_data_hex encodes a different one.
 *   2. txCheck — re-encode raw_data and confirm it yields those same bytes, which additionally
 *      proves the JSON a caller inspected is the JSON being signed (down to every field).
 *
 * Layer 2 is skipped ONLY for contract types tronweb cannot encode at all
 * (the Market and Shielded families), which layers 1 and 1.5 still bind — so a disguised *type* can no
 * longer slip through. One residual remains and is NOT closed here: a same-type payload of an
 * unencodable contract with attacker-chosen *field values* (e.g. a ShieldedTransferContract that moves
 * value, showing benign fields in raw_data while raw_data_hex carries different ones). tronweb ships
 * no encoder OR field decoder for those families, so no layer can verify their fields; a caller of the
 * pure `tx sign` must treat Market/Shielded field contents as unverified. Every other failure is fatal: a re-encode that
 * throws for any other reason (a float amount, an out-of-range value, a malformed address) is
 * indistinguishable from a payload crafted to dodge the check, and several such payloads look
 * entirely benign to a human reading the JSON.
 *
 * Neither layer is policy — they reject nothing a correct transaction builder produces, only
 * self-inconsistent payloads.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { ChainError } from "../../../../domain/errors/index.js";
import { rawDataHexOf } from "./transaction-codec.js";

/** tronweb's txJsonToPb rejects contract types it has no protobuf mapping for with this message. */
const UNSUPPORTED_CONTRACT_TYPE = /^Unsupported transaction type/i;

/** Minimal shape of the protobuf definitions tronweb publishes on globalThis when it is imported. */
interface TronProto {
  Transaction: {
    raw: { deserializeBinary(bytes: Uint8Array): { getContractList(): { getType(): number }[] } };
    Contract: { ContractType: Record<string, number> };
  };
}

/** ContractType names normalized to a case-insensitive lookup, built once from tronweb's protobuf. */
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

/**
 * Layer 1.5 — bind the contract type(s) a caller reads in raw_data to the ones raw_data_hex encodes.
 * Decoding the outer envelope succeeds even for contract types tronweb cannot re-encode, so this
 * applies where layer 2 cannot. Fails closed: a raw_data_hex that will not decode, an unrecognized
 * type name, or any mismatch means we cannot confirm what we would sign.
 */
function assertContractTypeBinding(rawData: unknown, rawDataHex: string): void {
  // Load-bearing assumption: tronweb publishes its protobuf definitions on globalThis as an import
  // side effect. If a tronweb upgrade renames/removes this global, signing fails closed here (safe),
  // and the pinning tests in signing-strategy.test.ts are the tripwire that catches the drift.
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
    // Never tronweb's `txCheck` here: it mis-encodes several contract types, so asking it would
    // refuse transactions whose bytes are correct. `rawDataHexOf` applies OUR serialiser for every
    // overridden type — TRC10 (multi-tranche AssetIssue, UnfreezeAsset) and governance
    // (ProposalCreate, UpdateEnergyLimit) — from one table, and delegates to tronweb for everything
    // else. So this comparison uses the same arbiter the builders themselves used.
    matchesRawData = rawDataHexOf(tx) === t.raw_data_hex.replace(/^0x/, "").toLowerCase();
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    // The one tolerable failure: tronweb has no encoding for this contract type, so raw_data
    // cannot be verified by anyone. Layer 1 still binds the signature to the executed bytes.
    if (UNSUPPORTED_CONTRACT_TYPE.test(message)) return;
    // Anything else — a float amount, an over-range value, a malformed address — means raw_data
    // could not be re-encoded. Fail closed: an unverifiable raw_data is exactly what a crafted
    // payload produces, and it looks benign in the JSON.
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
