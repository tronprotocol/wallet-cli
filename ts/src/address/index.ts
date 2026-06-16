/**
 * AddressCodec (L0) — derive & validate chain addresses from public keys.
 *   TRON: 0x41 || keccak256(pub[1:])[-20:] → Base58Check
 *   EVM : keccak256(pub[1:])[-20:] → 0x... (EIP-55)
 * (plan §7.12)
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58check } from "@scure/base";
import type { Bytes, ChainFamily } from "../types/index.js";

export interface AddressCodec {
  family: ChainFamily;
  fromPublicKey(pub: Bytes): string;
  validate(addr: string): boolean;
}

const b58c = base58check(sha256);

/** uncompressed (65B, 0x04…) or compressed pubkey → last-20-bytes keccak hash. */
function pubKeyHash20(pub: Bytes): Bytes {
  const body = pub.length === 65 ? pub.slice(1) : pub; // strip 0x04 prefix
  return keccak_256(body).slice(-20);
}

function toEip55(hash20: Bytes): string {
  const hex = bytesToHex(hash20); // lowercase, no 0x
  const checksum = bytesToHex(keccak_256(utf8ToBytes(hex)));
  let out = "0x";
  for (let i = 0; i < hex.length; i++) {
    const c = hex[i]!;
    out += parseInt(checksum[i]!, 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

export class EvmAddress implements AddressCodec {
  readonly family: ChainFamily = "evm";
  fromPublicKey(pub: Bytes): string {
    return toEip55(pubKeyHash20(pub));
  }
  validate(addr: string): boolean {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return false;
    // mixed-case → must match EIP-55 checksum; all-one-case (hex body) → accept.
    // Compare the hex body only: the "0x" prefix would break an all-uppercase comparison.
    const hex = addr.slice(2);
    if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;
    return toEip55(hexToBytes(hex)) === addr;
  }
}

export class TronAddress implements AddressCodec {
  readonly family: ChainFamily = "tron";
  fromPublicKey(pub: Bytes): string {
    const payload = new Uint8Array(21);
    payload[0] = 0x41;
    payload.set(pubKeyHash20(pub), 1);
    return b58c.encode(payload);
  }
  validate(addr: string): boolean {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false;
    try {
      const decoded = b58c.decode(addr);
      return decoded.length === 21 && decoded[0] === 0x41;
    } catch {
      return false;
    }
  }
}

export const ADDRESS_CODECS: Record<ChainFamily, AddressCodec> = {
  tron: new TronAddress(),
  evm: new EvmAddress(),
};

export function addressCodec(family: ChainFamily): AddressCodec {
  return ADDRESS_CODECS[family];
}
