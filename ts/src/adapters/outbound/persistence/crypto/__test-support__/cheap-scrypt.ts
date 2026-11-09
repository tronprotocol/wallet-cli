// Test-only KDF substitute: deterministic password/salt keys preserve wrong-password MAC failures.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Bytes } from "../../../../../domain/types/index.js";

export function scrypt(password: Bytes | string, salt: Bytes, opts: { dkLen: number }): Bytes {
  const pw = typeof password === "string" ? utf8ToBytes(password) : password;
  const key = keccak_256(concatBytes(pw, salt));
  if (opts.dkLen === key.length) return key;
  throw new Error(`cheap-scrypt only supports dkLen 32, got ${opts.dkLen}`);
}
