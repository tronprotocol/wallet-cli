// Private version-1 envelope; seed plaintext is an encoded vault, not a Web3 V3 private key.
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
    // A shorter derived key leaves the MAC independent of the password; the writer always uses KDF.dklen.
    if (c.kdfparams.dklen !== KDF.dklen) {
      throw new ExecutionError(
        "encoding_error",
        `wallet file declares an unsupported derived key length ${String(c.kdfparams.dklen)}; expected ${KDF.dklen}`,
      );
    }
    const dk = Web3Crypto.scryptKey(password, hexToBytes(c.kdfparams.salt), c.kdfparams);
    const ciphertext = hexToBytes(c.ciphertext);
    if (bytesToHex(mac(dk, ciphertext)) !== c.mac) {
      throw new ExecutionError("auth_failed", "incorrect master password");
    }
    return Web3Crypto.crypt(dk, hexToBytes(c.cipherparams.iv), ciphertext);
  }
}
