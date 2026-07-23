/**
 * Test double for @noble/hashes/scrypt — imported ONLY from *.test.ts via vi.mock, never by
 * production code. Real scrypt at n=2^18 is deliberately slow (hundreds of ms per call); a suite
 * that encrypts/decrypts dozens of keystores spends a minute in key derivation it does not need to
 * exercise. Correctness of the KDF itself is covered separately by crypto.test.ts against the real
 * implementation.
 *
 * The substitute must behave like a KDF for the surrounding logic to hold:
 *  - deterministic in (password, salt) so encrypt→decrypt round-trips (it ignores N/r/p);
 *  - different key for a different password so a wrong-password MAC check still fails.
 * keccak256(password || salt) gives exactly dkLen = 32 bytes with both properties.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Bytes } from "../../../../../domain/types/index.js";

export function scrypt(password: Bytes | string, salt: Bytes, opts: { dkLen: number }): Bytes {
  const pw = typeof password === "string" ? utf8ToBytes(password) : password;
  const key = keccak_256(concatBytes(pw, salt));
  if (opts.dkLen === key.length) return key;
  // every keystore blob uses dkLen 32 (= keccak output); guard the assumption loudly rather than
  // silently return a wrong-length key.
  throw new Error(`cheap-scrypt only supports dkLen 32, got ${opts.dkLen}`);
}
