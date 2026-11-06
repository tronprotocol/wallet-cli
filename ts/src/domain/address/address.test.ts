import { describe, it, expect } from "vitest";
import {
  EvmAddress,
  TronAddress,
  evmAddressFromPublicKey,
  evmChecksumAddress,
  isEvmAddress,
  isTronHexAddress,
  tronAddressBytes,
  tronAddressFromEvmHex,
  tronAddressFromHash20,
  tronAddressToEvmHex,
  tronHash20Hex,
  tronHexFromHash20,
} from "./index.js";
import { Derivation } from "../derivation/index.js";
import { hexToBytes } from "@noble/hashes/utils.js";

// EIP-55 test vectors.
const CHECKSUMMED = [
  "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
  "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
  "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
];

describe("isEvmAddress", () => {
  it.each(CHECKSUMMED)("accepts the correctly checksummed address %s", (address) => {
    expect(isEvmAddress(address)).toBe(true);
  });
});

describe("isEvmAddress rejects a broken checksum", () => {
  it.each([
    ["0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "A->a at index 2"],
    ["0xfb6916095ca1df60bB79Ce92cE3Ea74c37c5d359", "B->b at index 1"],
    ["0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6Fb", "B->b at the end"],
    ["0xD1220A0Cf47c7B9Be7A2E6BA89F429762e7b9aDb", "c->C at index 7"],
  ])("rejects %s (%s)", (address) => {
    expect(isEvmAddress(address)).toBe(false);
  });
});

describe("isEvmAddress accepts unchecksummed input", () => {
  it("accepts an all-lowercase address", () => {
    expect(isEvmAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(true);
  });

  it("accepts an all-uppercase address", () => {
    expect(isEvmAddress("0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED")).toBe(true);
  });
});

describe("isEvmAddress accepts an uppercase 0X prefix", () => {
  it("accepts an all-lowercase body with an uppercase 0X prefix", () => {
    expect(isEvmAddress("0X5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(true);
  });

  it("accepts a correctly-checksummed body with an uppercase 0X prefix", () => {
    expect(isEvmAddress("0X5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(true);
  });
});

describe("isEvmAddress rejects malformed input", () => {
  it.each([
    ["empty", ""],
    ["no 0x prefix", "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
    ["one nibble short", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe"],
    ["one nibble long", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAedd"],
    ["non-hex character", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeg"],
    ["leading whitespace", " 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
    ["trailing whitespace", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed "],
    ["a TRON base58 address", "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"],
    ["a TRON hex address", "0x41e2e1a54926527fbb4e4420de4c6bab82beaee24d"],
  ])("rejects %s", (_label, address) => {
    expect(isEvmAddress(address)).toBe(false);
  });
});

describe("evmAddressFromPublicKey", () => {
  // Published Anvil / Hardhat account #0.
  const ANVIL_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const ANVIL_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  it("derives the published address for a known private key", () => {
    const pub = Derivation.publicKeyFromPrivate(hexToBytes(ANVIL_KEY));
    expect(evmAddressFromPublicKey(pub)).toBe(ANVIL_ADDRESS);
  });

  it("emits an address that passes its own EIP-55 check", () => {
    const pub = Derivation.publicKeyFromPrivate(hexToBytes(ANVIL_KEY));
    expect(isEvmAddress(evmAddressFromPublicKey(pub))).toBe(true);
  });

  it("shares its 20-byte body with the TRON address of the same key", () => {
    const pub = Derivation.publicKeyFromPrivate(hexToBytes(ANVIL_KEY));
    const tron = new TronAddress().fromPublicKey(pub);

    const reEncoded = evmChecksumAddress(tronAddressBytes(tron).slice(1));

    expect(reEncoded).toBe(evmAddressFromPublicKey(pub));
  });
});

describe("AddressCodec.canonical", () => {
  const codec = new EvmAddress();
  const CHECKSUMMED = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

  it("checksums an all-lowercase EVM address", () => {
    expect(codec.canonical(CHECKSUMMED.toLowerCase())).toBe(CHECKSUMMED);
  });

  it("checksums an all-uppercase EVM address", () => {
    expect(codec.canonical(`0x${CHECKSUMMED.slice(2).toUpperCase()}`)).toBe(CHECKSUMMED);
  });

  it("leaves an already-checksummed address untouched", () => {
    expect(codec.canonical(CHECKSUMMED)).toBe(CHECKSUMMED);
  });

  it("checksums an all-lowercase EVM address with an uppercase 0X prefix", () => {
    expect(codec.canonical(`0X${CHECKSUMMED.slice(2).toLowerCase()}`)).toBe(CHECKSUMMED);
  });

  // Callers also pass labels and references.
  it("passes a value that is not an address through unchanged", () => {
    expect(codec.canonical("not-an-address")).toBe("not-an-address");
  });

  it("is the identity for TRON", () => {
    const tron = "TBhCfAytweLuLLL2gr8xxxxxxxxxxxxxxx";
    expect(new TronAddress().canonical(tron)).toBe(tron);
  });
});

describe("TRON hex conversions", () => {
  const base58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const hash20 = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";

  it("reads the 20-byte hash from every accepted form", () => {
    for (const form of [
      base58,
      `41${hash20}`,
      `0x41${hash20}`,
      `0x${hash20}`,
      hash20.toUpperCase(),
    ]) {
      expect(tronHash20Hex(form)).toBe(hash20);
    }
    expect(() => tronHash20Hex("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc")).toThrow();
  });

  it("builds Base58Check and hex forms from the 20-byte hash", () => {
    expect(tronAddressFromHash20(hash20)).toBe(base58);
    expect(tronAddressFromHash20(hexToBytes(hash20))).toBe(base58);
    expect(() => tronAddressFromHash20(hash20.slice(2))).toThrow();
    expect(tronHexFromHash20(hash20)).toBe(`41${hash20}`);
    expect(tronAddressToEvmHex(base58)).toBe(`0x${hash20}`);
  });

  it("converts only 0x-prefixed 20-byte hex from the EVM form", () => {
    expect(tronAddressFromEvmHex(`0x${hash20}`)).toBe(base58);
    expect(tronAddressFromEvmHex(`41${hash20}`)).toBe(`41${hash20}`);
    expect(tronAddressFromEvmHex(base58)).toBe(base58);
  });

  it("recognizes unprefixed 21-byte TRON hex", () => {
    expect(isTronHexAddress(`41${hash20}`)).toBe(true);
    expect(isTronHexAddress(`0x41${hash20}`)).toBe(false);
    expect(isTronHexAddress(`42${hash20}`)).toBe(false);
  });
});
