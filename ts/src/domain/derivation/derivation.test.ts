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

// The software template follows the wallets a user can actually restore into: TronLink,
// agent-wallet and the Java wallet-cli on TRON, MetaMask/Rabby/Trezor on EVM. Both increment
// address_index, so both families share one shape.
describe("Derivation.path is the software template for every family", () => {
  it("increments address_index on TRON", () => {
    expect(Derivation.path("tron", 0)).toBe("m/44'/195'/0'/0/0");
    expect(Derivation.path("tron", 2)).toBe("m/44'/195'/0'/0/2");
  });

  it("increments address_index on EVM", () => {
    expect(Derivation.path("evm", 0)).toBe("m/44'/60'/0'/0/0");
    expect(Derivation.path("evm", 2)).toBe("m/44'/60'/0'/0/2");
  });
});

// Ledger Live hangs the account number at the account level on BOTH chains, and that is what a
// device user expects: an address this template does not produce is one Ledger Live will not
// display, however real it is on the device.
describe("Derivation.ledgerPath follows Ledger Live on every family", () => {
  it("puts TRON at the account level", () => {
    expect(Derivation.ledgerPath("tron", 0)).toBe("m/44'/195'/0'/0/0");
    expect(Derivation.ledgerPath("tron", 3)).toBe("m/44'/195'/3'/0/0");
  });

  it("puts EVM at the account level", () => {
    expect(Derivation.ledgerPath("evm", 0)).toBe("m/44'/60'/0'/0/0");
    expect(Derivation.ledgerPath("evm", 3)).toBe("m/44'/60'/3'/0/0");
  });

  // The Ledger template and the software one now differ on BOTH families, so `--index 1` means a
  // different path depending on where the account comes from. That is deliberate and the reason
  // `import ledger --path` exists.
  it("differs from the software template on both families", () => {
    expect(Derivation.ledgerPath("tron", 1)).not.toBe(Derivation.path("tron", 1));
    expect(Derivation.ledgerPath("evm", 1)).not.toBe(Derivation.path("evm", 1));
  });
});

// The old TRON template is the only historical one: EVM never differed, and index 0 is the same
// path under both, so neither yields a candidate.
describe("Derivation.legacyPaths lists the templates this CLI used to produce", () => {
  it("offers the old account-level TRON path for index >= 1", () => {
    expect(Derivation.legacyPaths("tron", 1)).toEqual(["m/44'/195'/1'/0/0"]);
  });

  it("offers nothing at index 0, where the templates agree", () => {
    expect(Derivation.legacyPaths("tron", 0)).toEqual([]);
  });

  it("offers nothing on EVM, which never changed", () => {
    expect(Derivation.legacyPaths("evm", 2)).toEqual([]);
  });
});
