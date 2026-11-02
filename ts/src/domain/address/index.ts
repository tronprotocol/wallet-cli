import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { createBase58check } from "@scure/base";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type { Bytes } from "../types/tx.js";
import type { ChainFamily } from "../family/chain-family.js";

export interface AddressCodec {
  family: ChainFamily;
  fromPublicKey(pub: Bytes): string;
  validate(addr: string): boolean;
  // Canonical spelling for valid addresses; passes other values through.
  canonical(addr: string): string;
}

const b58c = createBase58check(sha256);

// Accepts SEC1 keys and returns 65 uncompressed bytes.
export function uncompressedPublicKey(pub: Bytes): Bytes {
  if (pub.length !== 33 && pub.length !== 65) {
    throw new Error("public key must be 33 or 65 bytes");
  }
  // Parsing validates secp256k1 curve membership.
  return secp256k1.Point.fromBytes(pub).toBytes(false);
}

// Returns the last 20 bytes of keccak256(x || y) for either SEC1 encoding.
export function publicKeyHash20(pub: Bytes): Bytes {
  const body = uncompressedPublicKey(pub).slice(1);
  return keccak_256(body).slice(-20);
}

// Returns the 21-byte, 0x41-prefixed Base58Check payload.
export function tronAddressBytes(address: string): Bytes {
  const decoded = b58c.decode(address);
  if (decoded.length !== 21 || decoded[0] !== 0x41) {
    throw new Error("invalid TRON address");
  }
  return decoded;
}

export function tronHexAddress(address: string): string {
  return bytesToHex(tronAddressBytes(address));
}

// 21-byte TRON hex without a 0x prefix.
export function isTronHexAddress(value: string): boolean {
  return /^41[0-9a-fA-F]{40}$/.test(value);
}

// Lowercase 20-byte hex of Base58Check, 21-byte hex (41 or 0x41), 0x-prefixed or bare 20-byte hex.
export function tronHash20Hex(address: string): string {
  if (/^(?:0x41|0x|41)?[0-9a-fA-F]{40}$/.test(address)) return address.slice(-40).toLowerCase();
  return bytesToHex(tronAddressBytes(address).slice(1));
}

// Prefixes 20-byte hex with 41 without validating it.
export function tronHexFromHash20(hash20Hex: string): string {
  return `41${hash20Hex}`;
}

// Base58Check address of a 20-byte account hash, given as bytes or 40 hex digits.
export function tronAddressFromHash20(hash20: Bytes | string): string {
  const body = typeof hash20 === "string" ? hexToBytes(hash20) : hash20;
  if (body.length !== 20) throw new Error("TRON account hash must be 20 bytes");
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(body, 1);
  return b58c.encode(payload);
}

// Converts 0x-prefixed 20-byte hex to Base58Check; passes other values through.
export function tronAddressFromEvmHex(value: string): string {
  return /^0x[0-9a-f]{40}$/i.test(value) ? tronAddressFromHash20(value.slice(2)) : value;
}

// 0x-prefixed lowercase 20-byte hex for any form tronHash20Hex accepts.
export function tronAddressToEvmHex(address: string): string {
  return `0x${tronHash20Hex(address)}`;
}

export function evmChecksumAddress(hash20: Bytes): string {
  if (hash20.length !== 20) {
    throw new Error("EVM address payload must be 20 bytes");
  }
  const lower = bytesToHex(hash20);
  const checksum = bytesToHex(keccak_256(new TextEncoder().encode(lower)));
  let result = "0x";
  for (let index = 0; index < lower.length; index += 1) {
    const char = lower[index]!;
    result +=
      /[a-f]/.test(char) && Number.parseInt(checksum[index]!, 16) >= 8 ? char.toUpperCase() : char;
  }
  return result;
}

export function evmAddressFromPublicKey(pub: Bytes): string {
  return evmChecksumAddress(publicKeyHash20(pub));
}

export class TronAddress implements AddressCodec {
  readonly family: ChainFamily = "tron";
  fromPublicKey(pub: Bytes): string {
    return tronAddressFromHash20(publicKeyHash20(pub));
  }
  validate(addr: string): boolean {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false;
    try {
      tronAddressBytes(addr);
      return true;
    } catch {
      return false;
    }
  }
  // Base58Check has only one spelling per address.
  canonical(addr: string): string {
    return addr;
  }
}

export class EvmAddress implements AddressCodec {
  readonly family: ChainFamily = "evm";
  fromPublicKey(pub: Bytes): string {
    return evmAddressFromPublicKey(pub);
  }
  validate(addr: string): boolean {
    return isEvmAddress(addr);
  }
  // Valid addresses use EIP-55; other values pass through.
  canonical(addr: string): string {
    return isEvmAddress(addr) ? evmChecksumAddress(hexToBytes(addr.slice(2).toLowerCase())) : addr;
  }
}

// Converts 41-prefixed hex to Base58Check; passes other values through.
export function tronHexToBase58(address: unknown): string {
  const value = String(address ?? "");
  const hex = value.replace(/^0x/, "");
  if (!isTronHexAddress(hex)) return value;
  try {
    return b58c.encode(hexToBytes(hex));
  } catch {
    return value;
  }
}

// Returns the 21-byte, 0x41-prefixed Base58Check payload.
export function tronBase58ToBytes(address: string): Uint8Array {
  const decoded = b58c.decode(address);
  if (decoded.length !== 21 || decoded[0] !== 0x41) {
    throw new Error("invalid TRON address payload");
  }
  return decoded;
}

// Mixed-case input requires an EIP-55 checksum; uniform case is accepted unverified.
export function isEvmAddress(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/i.test(address)) return false;
  const body = address.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
  // The prefix case carries no checksum information.
  return "0x" + body === evmChecksumAddress(hexToBytes(body.toLowerCase()));
}
