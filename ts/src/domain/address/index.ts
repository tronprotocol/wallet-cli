/**
 * AddressCodec — derive and validate chain addresses from public keys.
 *   TRON: 0x41 || keccak256(pub[1:])[-20:] → Base58Check
 */
import { keccak_256 } from "@noble/hashes/sha3.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { createBase58check } from "@scure/base"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import type { Bytes, ChainFamily } from "../types/index.js"

export interface AddressCodec {
  family: ChainFamily
  fromPublicKey(pub: Bytes): string
  validate(addr: string): boolean
}

const b58c = createBase58check(sha256)

/** Valid SEC1 key → canonical uncompressed 65-byte representation. */
export function uncompressedPublicKey(pub: Bytes): Bytes {
  if (pub.length !== 33 && pub.length !== 65) {
    throw new Error("public key must be 33 or 65 bytes")
  }
  // Point parsing validates prefix, coordinates, and secp256k1 curve membership.
  return secp256k1.Point.fromBytes(pub).toBytes(false)
}

/** compressed/uncompressed public key → last-20-bytes keccak(x || y). */
export function publicKeyHash20(pub: Bytes): Bytes {
  const body = uncompressedPublicKey(pub).slice(1)
  return keccak_256(body).slice(-20)
}

/** Decode and validate a Base58Check TRON address payload. */
export function tronAddressBytes(address: string): Bytes {
  const decoded = b58c.decode(address)
  if (decoded.length !== 21 || decoded[0] !== 0x41) {
    throw new Error("invalid TRON address")
  }
  return decoded
}

export function tronAddressFromBytes(payload: Bytes): string {
  if (payload.length !== 21 || payload[0] !== 0x41) {
    throw new Error("TRON payload must be 0x41 + 20 bytes")
  }
  return b58c.encode(payload)
}

export function tronHexAddress(address: string): string {
  return bytesToHex(tronAddressBytes(address))
}

export function evmChecksumAddress(hash20: Bytes): string {
  if (hash20.length !== 20) {
    throw new Error("EVM address payload must be 20 bytes")
  }
  const lower = bytesToHex(hash20)
  const checksum = bytesToHex(
    keccak_256(new TextEncoder().encode(lower)),
  )
  let result = "0x"
  for (let index = 0; index < lower.length; index += 1) {
    const char = lower[index]!
    result +=
      /[a-f]/.test(char)
      && Number.parseInt(checksum[index]!, 16) >= 8
        ? char.toUpperCase()
        : char
  }
  return result
}

export function evmAddressFromPublicKey(pub: Bytes): string {
  return evmChecksumAddress(publicKeyHash20(pub))
}

export class TronAddress implements AddressCodec {
  readonly family: ChainFamily = "tron"
  fromPublicKey(pub: Bytes): string {
    const payload = new Uint8Array(21)
    payload[0] = 0x41
    payload.set(publicKeyHash20(pub), 1)
    return b58c.encode(payload)
  }
  validate(addr: string): boolean {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false
    try {
      tronAddressBytes(addr)
      return true
    } catch {
      return false
    }
  }
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
