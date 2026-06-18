import { describe, it, expect } from "vitest";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { CryptoEnvelope } from "./index.js";

describe("CryptoEnvelope", () => {
  const secret = utf8ToBytes("a very secret seed phrase entropy");

  it("round-trips plaintext with the correct password", () => {
    const blob = CryptoEnvelope.encrypt(secret, "pw123A", "vlt_1", "bip39-seed");
    const out = CryptoEnvelope.decrypt(blob, "pw123A");
    expect(bytesToHex(out)).toBe(bytesToHex(secret));
  });

  it("produces a self-describing blob with salt+iv+mac", () => {
    const blob = CryptoEnvelope.encrypt(secret, "pw", "vlt_2", "raw-privkey");
    expect(blob.crypto.cipher).toBe("aes-128-ctr");
    expect(blob.crypto.kdf).toBe("scrypt");
    expect(blob.crypto.kdfparams.salt).toMatch(/^[0-9a-f]+$/);
    expect(blob.crypto.cipherparams.iv).toMatch(/^[0-9a-f]+$/);
    expect(blob.crypto.mac).toMatch(/^[0-9a-f]+$/);
    expect(blob.type).toBe("raw-privkey");
  });

  it("rejects a wrong password with auth_failed", () => {
    const blob = CryptoEnvelope.encrypt(secret, "right", "vlt_3", "bip39-seed");
    expect(() => CryptoEnvelope.decrypt(blob, "wrong")).toThrowError(/auth_failed|incorrect/);
  });

  it("uses a fresh salt+iv per encryption", () => {
    const a = CryptoEnvelope.encrypt(secret, "pw", "id", "bip39-seed");
    const b = CryptoEnvelope.encrypt(secret, "pw", "id", "bip39-seed");
    expect(a.crypto.kdfparams.salt).not.toBe(b.crypto.kdfparams.salt);
    expect(a.crypto.ciphertext).not.toBe(b.crypto.ciphertext);
  });
});
