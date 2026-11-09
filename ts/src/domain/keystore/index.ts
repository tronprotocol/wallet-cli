// V3 files hold one raw private key; encryption uses scrypt, decryption also accepts PBKDF2.
import { randomUUID } from "node:crypto";
import { scrypt } from "@noble/hashes/scrypt.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ctr } from "@noble/ciphers/aes.js";
import {
  randomBytes,
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
  concatBytes,
} from "@noble/hashes/utils.js";
import type { Bytes } from "../types/index.js";
import { ExecutionError, UsageError } from "../errors/index.js";

// Export work factor, compatible with Java N_STANDARD.
export const SCRYPT_STANDARD = { n: 262144, r: 8, p: 1, dklen: 32 } as const;

const PRIVATE_KEY_BYTES = 32;

// Bound imported KDF work before authentication; scrypt also enforces library memory limits.
// Allow padded derived keys while bounding allocation.
const MAX_DKLEN = 1024;
const MAX_PBKDF2_ITERATIONS = 10_000_000;

export const Web3Crypto = {
  scryptKey(
    password: string,
    salt: Bytes,
    p: { n: number; r: number; p: number; dklen: number },
  ): Bytes {
    return scrypt(utf8ToBytes(password), salt, { N: p.n, r: p.r, p: p.p, dkLen: p.dklen });
  },

  // The Web3 MAC uses derived-key bytes 16..31.
  mac(dk: Bytes, ciphertext: Bytes): Bytes {
    return keccak_256(concatBytes(dk.slice(16, 32), ciphertext));
  },

  // AES-CTR uses the same operation for encryption and decryption.
  crypt(dk: Bytes, iv: Bytes, data: Bytes): Bytes {
    return ctr(dk.slice(0, 16), iv).encrypt(data);
  },
};

// Display address: TRON uses 41-prefixed hex; EVM uses 0x-prefixed hex.
export interface KeystoreV3File {
  version: 3;
  id: string;
  address: string;
  crypto: {
    cipher: "aes-128-ctr";
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: "scrypt";
    kdfparams: { n: number; r: number; p: number; dklen: number; salt: string };
    mac: string;
  };
}

const invalid = (why: string) =>
  new UsageError("invalid_keystore", `not a valid V3 keystore: ${why}`);

export const KeystoreV3 = {
  // hexAddress is display metadata, not authenticated identity.
  encrypt(privateKey: Bytes, password: string, hexAddress: string): KeystoreV3File {
    if (privateKey.length !== PRIVATE_KEY_BYTES) {
      throw new ExecutionError(
        "encoding_error",
        `a keystore holds a ${PRIVATE_KEY_BYTES}-byte private key, got ${privateKey.length}`,
      );
    }
    const salt = randomBytes(32);
    const iv = randomBytes(16);
    const dk = Web3Crypto.scryptKey(password, salt, SCRYPT_STANDARD);
    const ciphertext = Web3Crypto.crypt(dk, iv, privateKey);
    return {
      version: 3,
      id: randomUUID(),
      address: hexAddress,
      crypto: {
        cipher: "aes-128-ctr",
        ciphertext: bytesToHex(ciphertext),
        cipherparams: { iv: bytesToHex(iv) },
        kdf: "scrypt",
        kdfparams: { ...SCRYPT_STANDARD, salt: bytesToHex(salt) },
        mac: bytesToHex(Web3Crypto.mac(dk, ciphertext)),
      },
    };
  },

  // Ignores the stored address; callers must derive identity from the decrypted key.
  decrypt(file: unknown, password: string): Bytes {
    const f = asRecord(file, "not a JSON object");
    if (f.version !== 3) throw invalid(`version must be 3, got ${JSON.stringify(f.version)}`);
    const c = asRecord(f.crypto, "missing crypto section");
    if (c.cipher !== "aes-128-ctr") throw invalid(`unsupported cipher ${JSON.stringify(c.cipher)}`);

    const ciphertext = hexField(c.ciphertext, "crypto.ciphertext");
    const iv = hexField(
      asRecord(c.cipherparams, "missing crypto.cipherparams").iv,
      "crypto.cipherparams.iv",
    );
    const dk = deriveKey(c, password);

    // Compare decoded MAC bytes so hex case does not affect password validation.
    const mac = hexField(c.mac, "crypto.mac");
    if (!equalBytes(Web3Crypto.mac(dk, ciphertext), mac)) {
      throw new ExecutionError("wrong_keystore_password", "incorrect keystore file password");
    }
    const plaintext = Web3Crypto.crypt(dk, iv, ciphertext);
    // A valid MAC does not guarantee the payload is a private key.
    if (plaintext.length !== PRIVATE_KEY_BYTES) {
      throw invalid(
        `decrypted payload is ${plaintext.length} bytes, expected a ${PRIVATE_KEY_BYTES}-byte private key`,
      );
    }
    return plaintext;
  },
};

function deriveKey(c: Record<string, unknown>, password: string): Bytes {
  const p = asRecord(c.kdfparams, "missing crypto.kdfparams");
  const salt = hexField(p.salt, "crypto.kdfparams.salt");
  const dklen = intField(p.dklen, "crypto.kdfparams.dklen");
  // Require all 16 MAC key bytes at dk[16:32]; dklen <= 16 makes the MAC password-independent.
  if (dklen < PRIVATE_KEY_BYTES) {
    throw invalid(
      `crypto.kdfparams.dklen must be at least ${PRIVATE_KEY_BYTES}, got ${dklen}: a shorter derived key cannot bind the MAC to the password`,
    );
  }
  // Bound allocation before either KDF runs.
  if (dklen > MAX_DKLEN) {
    throw invalid(
      `crypto.kdfparams.dklen must be at most ${MAX_DKLEN}, got ${dklen}: no keystore needs a derived key that long`,
    );
  }
  if (c.kdf === "scrypt") {
    // Convert library parameter refusals into invalid-keystore errors.
    return derived(() =>
      Web3Crypto.scryptKey(password, salt, {
        n: intField(p.n, "crypto.kdfparams.n"),
        r: intField(p.r, "crypto.kdfparams.r"),
        p: intField(p.p, "crypto.kdfparams.p"),
        dklen,
      }),
    );
  }
  if (c.kdf === "pbkdf2") {
    if (p.prf !== undefined && p.prf !== "hmac-sha256")
      throw invalid(`unsupported pbkdf2 prf ${JSON.stringify(p.prf)}`);
    const c = intField(p.c, "crypto.kdfparams.c");
    // Bound PBKDF2 iterations before running the KDF.
    if (c > MAX_PBKDF2_ITERATIONS) {
      throw invalid(
        `crypto.kdfparams.c must be at most ${MAX_PBKDF2_ITERATIONS}, got ${c}: deriving the key would take longer than any import should`,
      );
    }
    return derived(() => pbkdf2(sha256, utf8ToBytes(password), salt, { c, dkLen: dklen }));
  }
  throw invalid(`unsupported kdf ${JSON.stringify(c.kdf)}`);
}

// Report imported KDF parameter failures as invalid keystores.
function derived(kdf: () => Bytes): Bytes {
  try {
    return kdf();
  } catch (e) {
    throw invalid(`crypto.kdfparams could not derive a key: ${(e as Error).message}`);
  }
}

function asRecord(value: unknown, why: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid(why);
  return value as Record<string, unknown>;
}

function equalBytes(a: Bytes, b: Bytes): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function hexField(value: unknown, field: string): Bytes {
  if (typeof value !== "string" || !/^[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw invalid(`${field} is not a hex string`);
  }
  return hexToBytes(value);
}

function intField(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw invalid(`${field} is not a positive integer`);
  return value;
}
