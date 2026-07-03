import { describe, it, expect } from "vitest";
import { Derivation } from "./index.js";
import { TronAddress } from "../address/index.js";

// Well-known hardhat/anvil test mnemonic
const MNEMONIC = "test test test test test test test test test test test junk";
const tron = new TronAddress();

describe("Derivation + AddressCodec", () => {
  it("derives distinct addresses per account index", () => {
    const seed = Derivation.mnemonicToSeed(MNEMONIC);
    const a0 = tron.fromPublicKey(Derivation.derive(seed, Derivation.path("tron", 0)).publicKey);
    const a1 = tron.fromPublicKey(Derivation.derive(seed, Derivation.path("tron", 1)).publicKey);
    expect(a0).not.toBe(a1);
  });

  it("passphrase changes the derived seed", () => {
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
  it("rejects malformed TRON addresses", () => {
    expect(tron.validate("Txxxx")).toBe(false);
    expect(tron.validate("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(false);
  });
});
