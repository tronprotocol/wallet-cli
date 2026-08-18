/**
 * CryptoEnvelope — our private at-rest blob: scrypt → aes-128-ctr → keccak MAC.
 * Each blob carries its own salt+iv; one master password derives a distinct key per file.
 *
 * `version: 1` with a `type` tag is OUR wrapper, not the interoperable Web3 V3 file — a seed blob's
 * plaintext is an encoded vault, not a bare key. The shared construction lives in domain/keystore;
 * the exportable V3 format is `KeystoreV3` there. This wrapper is live on-disk data for every
 * existing wallet: it must not drift.
 */
import { randomBytes, bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type {
  Bytes,
  CryptoParams,
  KeystoreBlob,
  KeystoreType,
} from "../../../../domain/types/index.js";
import { SCRYPT_STANDARD, Web3Crypto } from "../../../../domain/keystore/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";

const KDF = SCRYPT_STANDARD;

function deriveKey(password: string, salt: Bytes): Bytes {
  return Web3Crypto.scryptKey(password, salt, KDF);
}

const mac = Web3Crypto.mac;

export class CryptoEnvelope {
  static encrypt(plaintext: Bytes, password: string, id: string, type: KeystoreType): KeystoreBlob {
    const salt = randomBytes(32);
    const iv = randomBytes(16);
    const dk = deriveKey(password, salt);
    const ciphertext = Web3Crypto.crypt(dk, iv, plaintext);
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
    const dk = Web3Crypto.scryptKey(password, hexToBytes(c.kdfparams.salt), c.kdfparams);
    const ciphertext = hexToBytes(c.ciphertext);
    if (bytesToHex(mac(dk, ciphertext)) !== c.mac) {
      throw new ExecutionError("auth_failed", "incorrect master password");
    }
    return Web3Crypto.crypt(dk, hexToBytes(c.cipherparams.iv), ciphertext);
  }
}
