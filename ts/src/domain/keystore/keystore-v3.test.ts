import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ctr } from "@noble/ciphers/aes.js";
import { KeystoreV3, Web3Crypto } from "./index.js";

const KEY = hexToBytes("4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d");
const ADDRESS = "41f0cc5a2b8d4e7f9c1a3b5d7e9f0a2c4b6d8e0f12";
const PW = "Str0ng!pass";

// Use a low scrypt cost for import tests.
function lightV3(privateKey = KEY, password = PW) {
  const salt = new Uint8Array(32).fill(7);
  const iv = new Uint8Array(16).fill(3);
  const kdfparams = { n: 1024, r: 8, p: 1, dklen: 32 };
  const dk = Web3Crypto.scryptKey(password, salt, kdfparams);
  const ciphertext = Web3Crypto.crypt(dk, iv, privateKey);
  return {
    version: 3,
    id: "aa0f2c1e-0000-4000-8000-000000000001",
    address: ADDRESS,
    crypto: {
      cipher: "aes-128-ctr",
      ciphertext: bytesToHex(ciphertext),
      cipherparams: { iv: bytesToHex(iv) },
      kdf: "scrypt",
      kdfparams: { ...kdfparams, salt: bytesToHex(salt) },
      mac: bytesToHex(Web3Crypto.mac(dk, ciphertext)),
    },
  };
}

function pbkdf2V3() {
  const salt = new Uint8Array(32).fill(9);
  const iv = new Uint8Array(16).fill(5);
  const dk = pbkdf2(sha256, utf8ToBytes(PW), salt, { c: 4096, dkLen: 32 });
  const ciphertext = ctr(dk.slice(0, 16), iv).encrypt(KEY);
  return {
    version: 3,
    id: "aa0f2c1e-0000-4000-8000-000000000002",
    address: ADDRESS,
    crypto: {
      cipher: "aes-128-ctr",
      ciphertext: bytesToHex(ciphertext),
      cipherparams: { iv: bytesToHex(iv) },
      kdf: "pbkdf2",
      kdfparams: { c: 4096, dklen: 32, prf: "hmac-sha256", salt: bytesToHex(salt) },
      mac: bytesToHex(Web3Crypto.mac(dk, ciphertext)),
    },
  };
}

describe("KeystoreV3.encrypt", () => {
  it("writes the standard V3 wrapper — version 3, uuid id, address, no internal type tag", () => {
    const file = KeystoreV3.encrypt(KEY, PW, ADDRESS);
    expect(file.version).toBe(3);
    expect(file.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(file.address).toBe(ADDRESS);
    expect(Object.keys(file).sort()).toEqual(["address", "crypto", "id", "version"]);
    expect(file).not.toHaveProperty("type");
  });

  it("writes scrypt at the Java N_STANDARD work factor with aes-128-ctr", () => {
    const { crypto } = KeystoreV3.encrypt(KEY, PW, ADDRESS);
    expect(crypto.cipher).toBe("aes-128-ctr");
    expect(crypto.kdf).toBe("scrypt");
    expect(crypto.kdfparams).toMatchObject({ n: 262144, r: 8, p: 1, dklen: 32 });
    expect(crypto.ciphertext).toHaveLength(64); // 32 bytes encoded as hex.
  });

  it("round-trips its own output", () => {
    const file = KeystoreV3.encrypt(KEY, PW, ADDRESS);
    expect(bytesToHex(KeystoreV3.decrypt(file, PW))).toBe(bytesToHex(KEY));
  });

  it("uses a fresh salt and iv per call, so the same key never yields the same ciphertext", () => {
    const a = KeystoreV3.encrypt(KEY, PW, ADDRESS);
    const b = KeystoreV3.encrypt(KEY, PW, ADDRESS);
    expect(a.crypto.ciphertext).not.toBe(b.crypto.ciphertext);
    expect(a.crypto.kdfparams.salt).not.toBe(b.crypto.kdfparams.salt);
    expect(a.crypto.cipherparams.iv).not.toBe(b.crypto.cipherparams.iv);
  });

  it("refuses a payload that is not a 32-byte private key", () => {
    expect(() => KeystoreV3.encrypt(KEY.slice(0, 16), PW, ADDRESS)).toThrowError(
      /32-byte private key/,
    );
  });
});

describe("KeystoreV3.decrypt", () => {
  it("reads a scrypt keystore", () => {
    expect(bytesToHex(KeystoreV3.decrypt(lightV3(), PW))).toBe(bytesToHex(KEY));
  });

  it("reads a pbkdf2 keystore — the KDF we accept but never emit", () => {
    expect(bytesToHex(KeystoreV3.decrypt(pbkdf2V3(), PW))).toBe(bytesToHex(KEY));
  });

  it("reports a wrong file password distinctly from a malformed file", () => {
    expect(() => KeystoreV3.decrypt(lightV3(), "not-the-password")).toThrowError(
      /incorrect keystore file password/,
    );
    try {
      KeystoreV3.decrypt(lightV3(), "not-the-password");
    } catch (e: any) {
      expect(e.code).toBe("wrong_keystore_password");
    }
  });

  it.each([
    ["a non-object", 42, /not a JSON object/],
    [
      "our own version-1 vault blob",
      { version: 1, type: "raw-privkey", id: "key_x", crypto: lightV3().crypto },
      /version must be 3/,
    ],
    [
      "an unsupported cipher",
      { ...lightV3(), crypto: { ...lightV3().crypto, cipher: "aes-256-gcm" } },
      /unsupported cipher/,
    ],
    [
      "an unknown kdf",
      { ...lightV3(), crypto: { ...lightV3().crypto, kdf: "argon2" } },
      /unsupported kdf/,
    ],
    [
      "a non-hex ciphertext",
      { ...lightV3(), crypto: { ...lightV3().crypto, ciphertext: "zz" } },
      /ciphertext is not a hex string/,
    ],
    [
      "a missing crypto section",
      { version: 3, id: "x", address: ADDRESS },
      /missing crypto section/,
    ],
  ])("rejects %s before the password is used", (_label, file, message) => {
    expect(() => KeystoreV3.decrypt(file, PW)).toThrowError(message as RegExp);
    try {
      KeystoreV3.decrypt(file, PW);
    } catch (e: any) {
      expect(e.code).toBe("invalid_keystore");
    }
  });

  it("rejects a MAC-valid file whose payload is not a 32-byte key", () => {
    const file = lightV3(utf8ToBytes(JSON.stringify({ v: 1, entropy: "00".repeat(16) })));
    expect(() => KeystoreV3.decrypt(file, PW)).toThrowError(/expected a 32-byte private key/);
  });

  it("ignores the file's address field — the decrypted key is the only source of identity", () => {
    const file = { ...lightV3(), address: "41deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" };
    expect(bytesToHex(KeystoreV3.decrypt(file, PW))).toBe(bytesToHex(KEY));
  });
});

describe("V3 import rejects a derived key too short to authenticate the password", () => {
  const shortDklen = (kdf: "pbkdf2" | "scrypt", password: string) => {
    const salt = new Uint8Array(32).fill(11);
    const iv = new Uint8Array(16).fill(13);
    const kdfparams =
      kdf === "pbkdf2"
        ? { c: 1, prf: "hmac-sha256", dklen: 16, salt: bytesToHex(salt) }
        : { n: 1024, r: 8, p: 1, dklen: 16, salt: bytesToHex(salt) };
    const dk =
      kdf === "pbkdf2"
        ? pbkdf2(sha256, utf8ToBytes(password), salt, { c: 1, dkLen: 16 })
        : Web3Crypto.scryptKey(password, salt, { n: 1024, r: 8, p: 1, dklen: 16 });
    const ciphertext = ctr(dk.slice(0, 16), iv).encrypt(KEY);
    return {
      version: 3,
      id: "aa0f2c1e-0000-4000-8000-000000000002",
      address: ADDRESS,
      crypto: {
        cipher: "aes-128-ctr",
        ciphertext: bytesToHex(ciphertext),
        cipherparams: { iv: bytesToHex(iv) },
        kdf,
        kdfparams,
        // An empty MAC key leaves the MAC independent of the password.
        mac: bytesToHex(Web3Crypto.mac(dk, ciphertext)),
      },
    };
  };

  it.each(["pbkdf2", "scrypt"] as const)("refuses a %s file declaring dklen 16", (kdf) => {
    expect(() => KeystoreV3.decrypt(shortDklen(kdf, PW), PW)).toThrowError(/dklen/i);
  });

  it.each(["pbkdf2", "scrypt"] as const)(
    "refuses a %s file under any password, not just the wrong one",
    (kdf) => {
      const file = shortDklen(kdf, PW);
      for (const attempt of [PW, "completely-different-password", ""]) {
        expect(() => KeystoreV3.decrypt(file, attempt)).toThrowError(/dklen/i);
      }
    },
  );

  it("still accepts the standard dklen 32", () => {
    expect(KeystoreV3.decrypt(lightV3(), PW)).toEqual(KEY);
  });
});

describe("V3 import compares the MAC by value, not by how it was written", () => {
  const withMac = (mac: unknown) => {
    const file = lightV3() as unknown as { crypto: Record<string, unknown> };
    file.crypto.mac = mac;
    return file;
  };
  const macOf = () => (lightV3() as unknown as { crypto: { mac: string } }).crypto.mac;

  it.each([
    ["uppercase", (m: string) => m.toUpperCase()],
    ["mixed case", (m: string) => m.slice(0, 8).toUpperCase() + m.slice(8)],
  ])("accepts a correct MAC written in %s", (_label, rewrite) => {
    expect(KeystoreV3.decrypt(withMac(rewrite(macOf())), PW)).toEqual(KEY);
  });

  it("still rejects a wrong password as a wrong password", () => {
    expect(() => KeystoreV3.decrypt(lightV3(), "not-the-password")).toThrowError(
      /incorrect keystore file password/,
    );
  });

  it.each([
    ["missing", undefined],
    ["not a string", 123],
    ["not hex", "zzzz"],
    ["an odd number of digits", "abc"],
  ])("reports a MAC that is %s as a malformed file, not a bad password", (_label, mac) => {
    expect(() => KeystoreV3.decrypt(withMac(mac), PW)).toThrowError(/not a valid V3 keystore/);
  });
});

describe("V3 import bounds the work an imported file can demand", () => {
  function withKdfParams(kdf: "scrypt" | "pbkdf2", kdfparams: Record<string, unknown>) {
    const base = kdf === "scrypt" ? lightV3() : pbkdf2V3();
    return {
      ...base,
      crypto: { ...base.crypto, kdfparams: { ...base.crypto.kdfparams, ...kdfparams } },
    };
  }

  it("refuses a pbkdf2 iteration count beyond the supported ceiling", () => {
    expect(() =>
      KeystoreV3.decrypt(withKdfParams("pbkdf2", { c: 1_000_000_000 }), PW),
    ).toThrowError(/crypto\.kdfparams\.c/i);
  });

  it("refuses a derived-key length far past any real keystore", () => {
    expect(() => KeystoreV3.decrypt(withKdfParams("pbkdf2", { dklen: 2 ** 30 }), PW)).toThrowError(
      /dklen/i,
    );
    expect(() => KeystoreV3.decrypt(withKdfParams("scrypt", { dklen: 2 ** 30 }), PW)).toThrowError(
      /dklen/i,
    );
  });

  it("refuses before doing the work", () => {
    const started = performance.now();
    expect(() =>
      KeystoreV3.decrypt(withKdfParams("pbkdf2", { c: 1_000_000_000 }), PW),
    ).toThrowError();
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("reports an out-of-range parameter as an invalid keystore, not a bad password", () => {
    try {
      KeystoreV3.decrypt(withKdfParams("pbkdf2", { c: 1_000_000_000 }), PW);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("invalid_keystore");
    }
  });

  it("still accepts the costs real wallets actually write", () => {
    expect(KeystoreV3.decrypt(lightV3(), PW)).toEqual(KEY);
    expect(KeystoreV3.decrypt(pbkdf2V3(), PW)).toEqual(KEY);
    expect(() => KeystoreV3.decrypt(withKdfParams("pbkdf2", { c: 262_144 }), PW)).toThrowError(
      /password/i, // Accept the cost despite the mismatched MAC.
    );
  });

  it("reports scrypt's own refusals as an invalid keystore too", () => {
    for (const params of [{ n: 2 ** 30 }, { n: 3 }]) {
      try {
        KeystoreV3.decrypt(withKdfParams("scrypt", params), PW);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as { code?: string }).code, JSON.stringify(params)).toBe("invalid_keystore");
      }
    }
    expect(() => KeystoreV3.decrypt(withKdfParams("scrypt", { n: 2 ** 30 }), PW)).toThrowError(
      /maxmem/i,
    );
    expect(() => KeystoreV3.decrypt(withKdfParams("scrypt", { n: 3 }), PW)).toThrowError(/power/i);
  });
});
