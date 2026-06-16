/**
 * CryptoEnvelope (L0) — Web3-style keystore blob: scrypt → aes-128-ctr → keccak MAC.
 * Each blob carries its own salt+iv; one master password derives a distinct key per file.
 * (plan §7.4)
 */
import { scrypt } from "@noble/hashes/scrypt.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ctr } from "@noble/ciphers/aes.js";
import { randomBytes, bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from "@noble/hashes/utils.js";
import type { Bytes, CryptoParams, KeystoreBlob, KeystoreType } from "../types/index.js";
import { ExecutionError } from "../errors/index.js";

const KDF = { n: 262144, r: 8, p: 1, dklen: 32 } as const;

function deriveKey(password: string, salt: Bytes): Bytes {
  return scrypt(utf8ToBytes(password), salt, { N: KDF.n, r: KDF.r, p: KDF.p, dkLen: KDF.dklen });
}

function mac(dk: Bytes, ciphertext: Bytes): Bytes {
  // keccak256(dk[16:32] || ciphertext)
  return keccak_256(concatBytes(dk.slice(16, 32), ciphertext));
}

export class CryptoEnvelope {
  static encrypt(plaintext: Bytes, password: string, id: string, type: KeystoreType): KeystoreBlob {
    const salt = randomBytes(32);
    const iv = randomBytes(16);
    const dk = deriveKey(password, salt);
    const ciphertext = ctr(dk.slice(0, 16), iv).encrypt(plaintext);
    const crypto: CryptoParams = {
      cipher: "aes-128-ctr",
      ciphertext: bytesToHex(ciphertext),
      cipherparams: { iv: bytesToHex(iv) },
      kdf: "scrypt",
      kdfparams: { n: KDF.n, r: KDF.r, p: KDF.p, dklen: KDF.dklen, salt: bytesToHex(salt) },
      mac: bytesToHex(mac(dk, ciphertext)),
    };
    return { id, type, version: 1, crypto };
  }

  static decrypt(blob: KeystoreBlob, password: string): Bytes {
    const c = blob.crypto;
    const salt = hexToBytes(c.kdfparams.salt);
    const dk = scrypt(utf8ToBytes(password), salt, {
      N: c.kdfparams.n,
      r: c.kdfparams.r,
      p: c.kdfparams.p,
      dkLen: c.kdfparams.dklen,
    });
    const ciphertext = hexToBytes(c.ciphertext);
    if (bytesToHex(mac(dk, ciphertext)) !== c.mac) {
      throw new ExecutionError("auth_failed", "incorrect master password");
    }
    return ctr(dk.slice(0, 16), hexToBytes(c.cipherparams.iv)).decrypt(ciphertext);
  }
}
