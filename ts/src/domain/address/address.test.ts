import { describe, it, expect } from "vitest";
import {
  EvmAddress,
  TronAddress,
  evmAddressFromPublicKey,
  evmChecksumAddress,
  isEvmAddress,
  tronAddressBytes,
} from "./index.js";
import { Derivation } from "../derivation/index.js";
import { hexToBytes } from "@noble/hashes/utils.js";

// Canonical EIP-55 vectors (https://eips.ethereum.org/EIPS/eip-55).
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
  // §1.3: a checksummed address with ONE character altered must fail. Letting it through turns
  // "typed one character wrong" and "clipboard was swapped" straight into fund loss.
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
  // §1.3: all-lower and all-upper carry no case information, so there is nothing to verify —
  // EIP-55 itself says clients may accept them. Both forms below are the same address as the
  // first CHECKSUMMED vector, whose checksum form is neither all-lower nor all-upper.
  it("accepts an all-lowercase address", () => {
    expect(isEvmAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(true);
  });

  it("accepts an all-uppercase address", () => {
    expect(isEvmAddress("0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED")).toBe(true);
  });
});

describe("isEvmAddress rejects malformed input", () => {
  it.each([
    ["empty", ""],
    ["no 0x prefix", "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
    ["uppercase 0X prefix", "0X5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
    ["one nibble short", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe"],
    ["one nibble long", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAedd"],
    ["non-hex character", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeg"],
    ["leading whitespace", " 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
    ["trailing whitespace", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed "],
    // cross-family: a TRON address must never validate as EVM (drives `familyOf` detection)
    ["a TRON base58 address", "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"],
    ["a TRON hex address", "0x41e2e1a54926527fbb4e4420de4c6bab82beaee24d"],
  ])("rejects %s", (_label, address) => {
    expect(isEvmAddress(address)).toBe(false);
  });
});

describe("evmAddressFromPublicKey", () => {
  // Anvil / Hardhat account #0 — a widely published key/address pair, so this anchors the
  // derivation to an external fact rather than to our own implementation.
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

  // ADR-0008 leans on this: a privateKey wallet's EVM address is a pure RE-ENCODING of its
  // cached TRON address, so that half of the migration needs no secret and no password.
  it("shares its 20-byte body with the TRON address of the same key", () => {
    const pub = Derivation.publicKeyFromPrivate(hexToBytes(ANVIL_KEY));
    const tron = new TronAddress().fromPublicKey(pub);

    const reEncoded = evmChecksumAddress(tronAddressBytes(tron).slice(1));

    expect(reEncoded).toBe(evmAddressFromPublicKey(pub));
  });
});

/**
 * §1.3 accepts more spellings than it prints: an all-lower or all-upper EVM address offers no
 * checksum to verify, so it is valid input — but everything this CLI stores and shows is EIP-55.
 * Without the normalising step the same address appears in two spellings depending on which
 * command wrote it, and a user comparing them concludes they are different addresses.
 */
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

  // Not this function's job to decide a non-address is wrong: callers hand it labels and refs too.
  it("passes a value that is not an address through unchanged", () => {
    expect(codec.canonical("not-an-address")).toBe("not-an-address");
  });

  // Base58Check fixes every character of a TRON address, so there is only ever one spelling.
  it("is the identity for TRON", () => {
    const tron = "TBhCfAytweLuLLL2gr8xxxxxxxxxxxxxxx";
    expect(new TronAddress().canonical(tron)).toBe(tron);
  });
});
