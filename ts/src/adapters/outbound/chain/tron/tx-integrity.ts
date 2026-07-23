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
 *   2. txCheck — re-encode raw_data and confirm it yields those same bytes, which additionally
 *      proves the JSON a caller inspected is the JSON being signed.
 *
 * Layer 2 is skipped ONLY for contract types tronweb cannot encode at all
 * (the Market and Shielded families), which layer 1 still binds. Every other failure is fatal: a re-encode that
 * throws for any other reason (a float amount, an out-of-range value, a malformed address) is
 * indistinguishable from a payload crafted to dodge the check, and several such payloads look
 * entirely benign to a human reading the JSON.
 *
 * Neither layer is policy — they reject nothing a correct transaction builder produces, only
 * self-inconsistent payloads.
 */
import { utils as tronUtils } from "tronweb"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { ChainError } from "../../../../domain/errors/index.js"

/** tronweb's txJsonToPb rejects contract types it has no protobuf mapping for with this message. */
const UNSUPPORTED_CONTRACT_TYPE = /^Unsupported transaction type/i

export function assertTronTxIntegrity(tx: unknown): void {
  const t = tx as { raw_data?: unknown; raw_data_hex?: unknown; txID?: unknown }
  if (!t || typeof t !== "object" || !t.raw_data || typeof t.raw_data_hex !== "string" || typeof t.txID !== "string") {
    throw new ChainError("tx_integrity", "TRON transaction must carry raw_data, raw_data_hex and txID; refusing to sign")
  }

  const claimed = t.txID.replace(/^0x/, "").toLowerCase()
  let derived: string
  try {
    derived = bytesToHex(sha256(hexToBytes(t.raw_data_hex.replace(/^0x/, ""))))
  } catch (e) {
    throw new ChainError("tx_integrity", `TRON transaction raw_data_hex is not valid hex: ${(e as Error).message}`)
  }
  if (derived !== claimed) {
    throw new ChainError("tx_integrity", "TRON transaction txID is not the hash of its raw_data_hex; refusing to sign")
  }

  let matchesRawData: boolean
  try {
    matchesRawData = tronUtils.transaction.txCheck(tx as any)
  } catch (e) {
    const message = (e as Error)?.message ?? String(e)
    // The one tolerable failure: tronweb has no encoding for this contract type, so raw_data
    // cannot be verified by anyone. Layer 1 still binds the signature to the executed bytes.
    if (UNSUPPORTED_CONTRACT_TYPE.test(message)) return
    // Anything else — a float amount, an over-range value, a malformed address — means raw_data
    // could not be re-encoded. Fail closed: an unverifiable raw_data is exactly what a crafted
    // payload produces, and it looks benign in the JSON.
    throw new ChainError("tx_integrity", `TRON transaction raw_data could not be re-encoded for verification: ${message}`)
  }
  if (!matchesRawData) {
    throw new ChainError("tx_integrity", "TRON transaction raw_data does not match its raw_data_hex; refusing to sign")
  }
}
