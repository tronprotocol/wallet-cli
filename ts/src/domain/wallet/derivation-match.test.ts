import { describe, it, expect } from "vitest";
import {
  derivationMismatchError,
  legacyAccounts,
  legacyDerivationError,
  resolveDerivation,
} from "./derivation-match.js";
import { Derivation } from "../derivation/index.js";
import { addressCodec } from "../family/index.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const seed = Derivation.mnemonicToSeed(MNEMONIC);

const TRON_CURRENT_1 = "TPjjvMwjPoDC32V2dGDYTkLH4E5LAtBZ6C"; // m/44'/195'/0'/0/1
const TRON_LEGACY_1 = "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ"; // m/44'/195'/1'/0/0
const TRON_INDEX_0 = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"; // identical under both
const EVM_INDEX_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("resolveDerivation", () => {
  it("reports the current template when the cached address came from it", () => {
    const r = resolveDerivation(seed, "tron", 1, TRON_CURRENT_1)!;
    expect(r.scheme).toBe("current");
    expect(r.path).toBe("m/44'/195'/0'/0/1");
  });

  it("reports the legacy template when the cached address came from that instead", () => {
    const r = resolveDerivation(seed, "tron", 1, TRON_LEGACY_1)!;
    expect(r.scheme).toBe("legacy");
    expect(r.path).toBe("m/44'/195'/1'/0/0");
  });

  it("returns the key that actually produces the cached address", () => {
    const r = resolveDerivation(seed, "tron", 1, TRON_LEGACY_1)!;
    const derived = addressCodec("tron").fromPublicKey(r.keyPair.publicKey);
    expect(derived).toBe(TRON_LEGACY_1);
  });

  it("calls index 0 current, where the two templates agree", () => {
    const r = resolveDerivation(seed, "tron", 0, TRON_INDEX_0)!;
    expect(r.scheme).toBe("current");
  });

  it("calls EVM current at any index, its template never having changed", () => {
    const r = resolveDerivation(seed, "evm", 1, EVM_INDEX_1)!;
    expect(r.scheme).toBe("current");
    expect(r.path).toBe("m/44'/60'/0'/0/1");
  });

  it("returns undefined when no template reproduces the cached address", () => {
    expect(resolveDerivation(seed, "tron", 1, TRON_INDEX_0)).toBeUndefined();
  });

  it("matches an EVM address stored in a non-canonical spelling", () => {
    const r = resolveDerivation(seed, "evm", 1, EVM_INDEX_1.toLowerCase())!;
    expect(r.scheme).toBe("current");
  });
});

describe("legacyAccounts", () => {
  const addressesWith = (tronAt1: string) => ({
    "0": { tron: TRON_INDEX_0, evm: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    "1": { tron: tronAt1, evm: EVM_INDEX_1 },
  });

  it("names the index and the path of an account on the old template", () => {
    expect(legacyAccounts(seed, addressesWith(TRON_LEGACY_1))).toEqual([
      { index: 1, path: "m/44'/195'/1'/0/0" },
    ]);
  });

  it("finds nothing when every account is on the current template", () => {
    expect(legacyAccounts(seed, addressesWith(TRON_CURRENT_1))).toEqual([]);
  });

  it("never reports index 0", () => {
    expect(legacyAccounts(seed, { "0": { tron: TRON_INDEX_0 } })).toEqual([]);
  });

  it("ignores an address no template explains", () => {
    expect(legacyAccounts(seed, { "1": { tron: TRON_INDEX_0 } })).toEqual([]);
  });

  it("ignores an account with no TRON address at all", () => {
    expect(legacyAccounts(seed, { "1": { evm: EVM_INDEX_1 } })).toEqual([]);
  });
});

describe("legacyDerivationError", () => {
  const REF = "wlt_abc123.1";
  const PATH = "m/44'/195'/1'/0/0";

  it("points to the complete procedure instead of inlining a partial deletion flow", () => {
    const m = legacyDerivationError(REF, PATH, "sign").message;
    expect(m).toContain("complete recovery procedure before deleting anything");
    expect(m).toContain("docs/troubleshooting/legacy-derivation-recovery.md");
    expect(m).not.toMatch(/wallet-cli (backup|import|delete)/);
  });

  it("avoids absolute recovery and wallet-compatibility claims", () => {
    expect(legacyDerivationError(REF, PATH, "sign").message).not.toMatch(
      /recovery phrase|unique to wallet-cli|no other wallet/i,
    );
  });

  it("names the real path and links the versioned recovery guide", () => {
    const m = legacyDerivationError(REF, PATH, "derive").message;
    expect(m).toContain(PATH);
    expect(m).toContain("blob/wallet-cli-4.13.1/ts/docs/troubleshooting");
  });

  it("uses the code the contract documents", () => {
    expect(legacyDerivationError(REF, PATH, "sign").code).toBe("legacy_derivation");
  });

  it("leads with signing for a sign refusal and with the wallet for a derive refusal", () => {
    expect(legacyDerivationError(REF, PATH, "sign").message).toMatch(/cannot be signed here/);
    const derive = legacyDerivationError(REF, PATH, "derive").message;
    expect(derive).toMatch(/^wallet wlt_abc123 holds account wlt_abc123\.1/);
    expect(derive).toMatch(/no further accounts can be derived/);
  });

  it("uses labels in prose without leaking the internal account ref", () => {
    const m = legacyDerivationError(REF, PATH, "derive", {
      account: "main's second",
      wallet: "main wallet",
    }).message;
    expect(m).toContain('wallet "main wallet" holds account "main\'s second"');
    expect(m).not.toContain(REF);
  });
});

describe("derivationMismatchError", () => {
  it("says the file and the vault disagree, and offers no rescue", () => {
    const m = derivationMismatchError("tron", "wlt_abc123.1");
    expect(m.code).toBe("derivation_mismatch");
    expect(m.message).toContain("wallets.json and the vault disagree");
    expect(m.message).not.toContain("--keystore");
  });

  it("appends the caller's consequence when it has one", () => {
    expect(
      derivationMismatchError("tron", "wlt_abc123.1", "so no further accounts").message,
    ).toMatch(/disagree, so no further accounts$/);
  });
});
