import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { convertEncoding } from "./index.js";

const TRON = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const EVM = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

describe("encoding convert", () => {
  it("converts TRON/EVM forms without changing the 20-byte payload", () => {
    expect(convertEncoding(TRON)).toMatchObject({
      inputType: "tron-base58",
      tronHex: "417e5f4552091a69125d5dfcb7b8c2659029395bdf",
      evm: EVM,
    });
    expect(convertEncoding(EVM)).toMatchObject({
      tron: TRON,
      tronHex: "417e5f4552091a69125d5dfcb7b8c2659029395bdf",
    });
  });

  it("derives the same address from compressed and uncompressed public keys", () => {
    const secret = Uint8Array.from([...new Uint8Array(31), 1]);
    const compressed = bytesToHex(secp256k1.getPublicKey(secret, true));
    const uncompressed = bytesToHex(
      secp256k1.getPublicKey(secret, false),
    );

    expect(convertEncoding(compressed)).toMatchObject({
      inputType: "public-key",
      tron: TRON,
      evm: EVM,
    });
    expect(convertEncoding(uncompressed)).toMatchObject({
      inputType: "public-key",
      tron: TRON,
      evm: EVM,
    });
  });

  it("round-trips generic hex through Base64 and Base58Check", () => {
    const converted = convertEncoding("deadbeef0102");
    expect(converted).toMatchObject({
      inputType: "hex",
      hex: "deadbeef0102",
      base64: "3q2+7wEC",
    });
    if (!("base58check" in converted)) throw new Error("wrong family");
    expect(convertEncoding(converted.base64)).toMatchObject({
      hex: "deadbeef0102",
    });
    expect(convertEncoding(converted.base58check)).toMatchObject({
      hex: "deadbeef0102",
    });
  });

  it("fails closed for bad checksums, bad curve points, and EIP-55 errors", () => {
    expect(() =>
      convertEncoding("TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HX")
    ).toThrow(/checksum/);
    expect(() =>
      convertEncoding("0x7E5F4552091A69125d5dfCb7b8C2659029395Bdf")
    ).toThrow(/EIP-55/);
    expect(() => convertEncoding(`04${"00".repeat(64)}`)).toThrow(
      /secp256k1/,
    );
  });

  it("rejects private-key-shaped data in hex and Base64", () => {
    expect(() => convertEncoding("11".repeat(32))).toThrow(/private key/);
    expect(() =>
      convertEncoding(Buffer.alloc(32, 0x11).toString("base64"))
    ).toThrow(/private key/);
  });
});
