/**
 * Web3 keystore crypto — the shared scrypt/AES/MAC construction, plus the standard **V3 file**
 * codec used to interoperate with other wallets (TronLink, the Java wallet-cli).
 *
 * Two audiences, deliberately separated:
 *   - `Web3Crypto` is the primitive construction (scrypt|pbkdf2 → aes-128-ctr → keccak MAC). Our
 *     private at-rest vault (`CryptoEnvelope`, `version: 1`) and the V3 interop file both use it,
 *     so the MAC is defined exactly once.
 *   - `KeystoreV3` is the on-the-wire *file format*: `{version: 3, id, address, crypto}` wrapping a
 *     single raw 32-byte private key. It never sees our vault's wrapper (`type`, `version: 1`) or
 *     its seed payload — a V3 keystore holds one key and nothing derivable.
 *
 * Asymmetric by design: we WRITE scrypt only, but READ scrypt or pbkdf2, matching the accept set of
 * the Java implementation (`Wallet.java`) so anything it or TronLink can open, we can open — with
 * one deliberate exception: a derived key shorter than the private key it must authenticate is
 * refused (see `deriveKey`), because accepting it would mean accepting any password.
 */
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

/** scrypt work factor we WRITE with. Matches the Java implementation's N_STANDARD (1 << 18). */
export const SCRYPT_STANDARD = { n: 262144, r: 8, p: 1, dklen: 32 } as const;

const PRIVATE_KEY_BYTES = 32;

export const Web3Crypto = {
  scryptKey(
    password: string,
    salt: Bytes,
    p: { n: number; r: number; p: number; dklen: number },
  ): Bytes {
    return scrypt(utf8ToBytes(password), salt, { N: p.n, r: p.r, p: p.p, dkLen: p.dklen });
  },

  /** keccak256(dk[16:32] || ciphertext) — the Web3 keystore MAC over the *derived* key's second half. */
  mac(dk: Bytes, ciphertext: Bytes): Bytes {
    return keccak_256(concatBytes(dk.slice(16, 32), ciphertext));
  },

  /** aes-128-ctr is its own inverse here; one function serves both directions. */
  crypt(dk: Bytes, iv: Bytes, data: Bytes): Bytes {
    return ctr(dk.slice(0, 16), iv).encrypt(data);
  },
};

/** A standard Web3 V3 keystore file. `address` is TRON's 21-byte hex form (`41…`), as written by
 *  the Java implementation's `exportKeystore`, so TronLink round-trips it. */
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
  /** Wrap ONE raw private key as a V3 file. `hexAddress` is recorded for other wallets to display;
   *  it is never trusted on the way back in (the key is the truth — see `decrypt`). */
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

  /**
   * Recover the private key from a parsed V3 keystore of ANY origin. Structure is validated before
   * the password is used, so a malformed file is reported as such instead of as a wrong password.
   * The file's own `address` is ignored: only the key it actually decrypts to can be trusted.
   */
  decrypt(file: unknown, password: string): Bytes {
    const f = asRecord(file, "not a JSON object");
    // Every reader in the wild (incl. Java's, which hard-rejects other versions) speaks v3 only.
    if (f.version !== 3) throw invalid(`version must be 3, got ${JSON.stringify(f.version)}`);
    const c = asRecord(f.crypto, "missing crypto section");
    if (c.cipher !== "aes-128-ctr") throw invalid(`unsupported cipher ${JSON.stringify(c.cipher)}`);

    const ciphertext = hexField(c.ciphertext, "crypto.ciphertext");
    const iv = hexField(
      asRecord(c.cipherparams, "missing crypto.cipherparams").iv,
      "crypto.cipherparams.iv",
    );
    const dk = deriveKey(c, password);

    // Through hexField like every other hex field, then compared as BYTES: `A1B2` and `a1b2` are the
    // same MAC, and comparing our lowercase rendering against the file's own spelling reported a
    // valid keystore as a wrong password. It also keeps a missing or non-hex mac reported as the
    // malformed file it is, rather than as a password the reader would then go and "fix".
    const mac = hexField(c.mac, "crypto.mac");
    if (!equalBytes(Web3Crypto.mac(dk, ciphertext), mac)) {
      throw new ExecutionError("wrong_keystore_password", "incorrect keystore file password");
    }
    const plaintext = Web3Crypto.crypt(dk, iv, ciphertext);
    // A V3 keystore carries exactly one private key. Anything else (a re-wrapped seed vault, a
    // truncated file) decrypts and MACs fine yet is not a key — reject it rather than import junk.
    if (plaintext.length !== PRIVATE_KEY_BYTES) {
      throw invalid(
        `decrypted payload is ${plaintext.length} bytes, expected a ${PRIVATE_KEY_BYTES}-byte private key`,
      );
    }
    return plaintext;
  },
};

/** scrypt or pbkdf2 (hmac-sha256) — the two KDFs Java's importer accepts. */
function deriveKey(c: Record<string, unknown>, password: string): Bytes {
  const p = asRecord(c.kdfparams, "missing crypto.kdfparams");
  const salt = hexField(p.salt, "crypto.kdfparams.salt");
  const dklen = intField(p.dklen, "crypto.kdfparams.dklen");
  // The MAC authenticates the password only through dk[16:32]. Below 32 bytes that slice is empty
  // and the MAC collapses to keccak(ciphertext) — a constant the file's author chooses — so every
  // password passes and decrypts to a different, unknowable key. Java is not fooled here (its
  // pbkdf2 path ignores dklen and derives 32; its scrypt path throws), so this is parity, not
  // divergence.
  if (dklen < PRIVATE_KEY_BYTES) {
    throw invalid(
      `crypto.kdfparams.dklen must be at least ${PRIVATE_KEY_BYTES}, got ${dklen}: a shorter derived key cannot bind the MAC to the password`,
    );
  }
  if (c.kdf === "scrypt") {
    return Web3Crypto.scryptKey(password, salt, {
      n: intField(p.n, "crypto.kdfparams.n"),
      r: intField(p.r, "crypto.kdfparams.r"),
      p: intField(p.p, "crypto.kdfparams.p"),
      dklen,
    });
  }
  if (c.kdf === "pbkdf2") {
    if (p.prf !== undefined && p.prf !== "hmac-sha256")
      throw invalid(`unsupported pbkdf2 prf ${JSON.stringify(p.prf)}`);
    return pbkdf2(sha256, utf8ToBytes(password), salt, {
      c: intField(p.c, "crypto.kdfparams.c"),
      dkLen: dklen,
    });
  }
  throw invalid(`unsupported kdf ${JSON.stringify(c.kdf)}`);
}

function asRecord(value: unknown, why: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid(why);
  return value as Record<string, unknown>;
}

/** Same bytes, same MAC — no timing claim: whoever can time this already holds the file and can
 *  try passwords offline, so the comparison is plain. */
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
