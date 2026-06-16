import { describe, it, expect } from "vitest";
import { Derivation } from "./index.js";
import { EvmAddress, TronAddress } from "../address/index.js";

// Well-known hardhat/anvil test mnemonic; account #0 → 0xf39Fd6...2266
const MNEMONIC = "test test test test test test test test test test test junk";
const evm = new EvmAddress();
const tron = new TronAddress();

describe("Derivation + AddressCodec", () => {
  it("derives the canonical EVM address from a known mnemonic (m/44'/60'/0'/0/0)", () => {
    const seed = Derivation.mnemonicToSeed(MNEMONIC);
    const kp = Derivation.derive(seed, Derivation.path("evm", 0));
    expect(evm.fromPublicKey(kp.publicKey)).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("derives distinct addresses per account index", () => {
    const seed = Derivation.mnemonicToSeed(MNEMONIC);
    const a0 = evm.fromPublicKey(Derivation.derive(seed, Derivation.path("evm", 0)).publicKey);
    const a1 = evm.fromPublicKey(Derivation.derive(seed, Derivation.path("evm", 1)).publicKey);
    expect(a0).not.toBe(a1);
  });

  it("passphrase changes the derived seed (修正⑤)", () => {
    const plain = Derivation.mnemonicToSeed(MNEMONIC);
    const withPass = Derivation.mnemonicToSeed(MNEMONIC, "extra");
    expect(Buffer.from(plain).toString("hex")).not.toBe(Buffer.from(withPass).toString("hex"));
  });

  it("derives a self-consistent TRON address (T-prefixed, validates)", () => {
    const seed = Derivation.mnemonicToSeed(MNEMONIC);
    const addr = tron.fromPublicKey(Derivation.derive(seed, Derivation.path("tron", 0)).publicKey);
    expect(addr.startsWith("T")).toBe(true);
    expect(tron.validate(addr)).toBe(true);
  });
});

describe("AddressCodec.validate", () => {
  it("validates EIP-55 checksummed addresses, rejects bad checksums", () => {
    expect(evm.validate("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(true);
    expect(evm.validate("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266")).toBe(true); // all-lower ok
    expect(evm.validate("0xF39FD6E51AAD88F6F4CE6AB8827279CFFFB92266")).toBe(true); // all-upper ok (regression)
    expect(evm.validate("0xF39fd6e51aad88f6f4ce6ab8827279cfffb92266")).toBe(false); // bad mixed-case
    expect(evm.validate("0x123")).toBe(false);
  });

  it("rejects malformed TRON addresses", () => {
    expect(tron.validate("Txxxx")).toBe(false);
    expect(tron.validate("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(false);
  });
});
