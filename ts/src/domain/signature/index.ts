import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import type { ChainFamily } from "../family/chain-family.js";
import { addressCodec } from "../family/index.js";
import type { Bytes } from "../types/tx.js";

const UTF8 = new TextEncoder();
const HEX = /^(?:0x)?((?:[0-9a-fA-F]{2})*)$/;

const MESSAGE_PREFIX: Record<ChainFamily, string> = {
  tron: "\x19TRON Signed Message:\n",
  evm: "\x19Ethereum Signed Message:\n",
};

export function hexBytes(hex: string): Bytes | undefined {
  const body = HEX.exec(hex)?.[1];
  return body === undefined ? undefined : hexToBytes(body);
}

// TIP-191 / EIP-191 digest of a UTF-8 message.
export function messageDigest(family: ChainFamily, message: string): Bytes {
  const body = UTF8.encode(message);
  return keccak_256(concatBytes(UTF8.encode(`${MESSAGE_PREFIX[family]}${body.length}`), body));
}

// A TRON signature commits to sha256(raw_data), which is also the txID.
export function tronTransactionDigest(rawDataHex: string): Bytes | undefined {
  const raw = hexBytes(rawDataHex);
  return raw === undefined ? undefined : sha256(raw);
}

export function keccakHex(hex: string): string | undefined {
  const raw = hexBytes(hex);
  return raw === undefined ? undefined : bytesToHex(keccak_256(raw));
}

// Address that a 65-byte r || s || v signature over digest recovers to, with v as 0/1 or 27/28;
// undefined when the signature is malformed.
export function recoverSignerAddress(
  family: ChainFamily,
  digest: Bytes,
  signatureHex: string,
): string | undefined {
  const raw = hexBytes(signatureHex);
  if (digest.length !== 32 || raw?.length !== 65) return undefined;
  const v = raw[64]!;
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) return undefined;
  try {
    const compressed = secp256k1.recoverPublicKey(
      concatBytes(Uint8Array.of(recovery), raw.slice(0, 64)),
      digest,
      { prehash: false },
    );
    return addressCodec(family).fromPublicKey(secp256k1.Point.fromBytes(compressed).toBytes(false));
  } catch {
    return undefined;
  }
}
