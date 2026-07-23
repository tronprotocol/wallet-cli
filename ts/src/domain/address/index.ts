/**
 * AddressCodec — derive and validate chain addresses from public keys.
 *   TRON: 0x41 || keccak256(pub[1:])[-20:] → Base58Check
 */
import { keccak_256 } from "@noble/hashes/sha3.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { createBase58check } from "@scure/base"
import { hexToBytes } from "@noble/hashes/utils.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import type { Bytes, ChainFamily } from "../types/index.js"

export interface AddressCodec {
  family: ChainFamily
  fromPublicKey(pub: Bytes): string
  validate(addr: string): boolean
}

const b58c = createBase58check(sha256)

/** uncompressed (65B, 0x04…) or compressed pubkey → last-20-bytes keccak hash. */
function pubKeyHash20(pub: Bytes): Bytes {
  let uncompressed = pub
  if (pub.length === 33) {
    try {
      uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false)
    } catch {
      throw new Error("invalid compressed secp256k1 public key")
    }
  }
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error("public key must be compressed or uncompressed secp256k1")
  }
  const body = uncompressed.slice(1)
  return keccak_256(body).slice(-20)
}

export class TronAddress implements AddressCodec {
  readonly family: ChainFamily = "tron"
  fromPublicKey(pub: Bytes): string {
    const payload = new Uint8Array(21)
    payload[0] = 0x41
    payload.set(pubKeyHash20(pub), 1)
    return b58c.encode(payload)
  }
  validate(addr: string): boolean {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false
    try {
      const decoded = b58c.decode(addr)
      return decoded.length === 21 && decoded[0] === 0x41
    } catch {
      return false
    }
  }
}

/** Decode and validate a Base58Check TRON address as its 21-byte 0x41-prefixed payload. */
export function tronAddressBytes(address: string): Bytes {
  if (!new TronAddress().validate(address)) throw new Error("invalid TRON address");
  return b58c.decode(address);
}

/** Convert a 41-prefixed TRON hex address to base58; preserve non-hex values unchanged. */
export function tronHexToBase58(address: unknown): string {
  const value = String(address ?? "");
  const hex = value.replace(/^0x/, "");
  if (!/^41[0-9a-fA-F]{40}$/.test(hex)) return value;
  try {
    return b58c.encode(hexToBytes(hex));
  } catch {
    return value;
  }
}
