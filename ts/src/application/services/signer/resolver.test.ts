import { describe, it, expect, beforeEach, vi } from "vitest";

// Cheap KDF for keystore encryption in this suite — see cheap-scrypt.ts. Production untouched.
vi.mock(
  "@noble/hashes/scrypt.js",
  async () =>
    import("../../../adapters/outbound/persistence/crypto/__test-support__/cheap-scrypt.js"),
);
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignerResolver } from "./index.js";
import { tronSignStrategy } from "../../../adapters/outbound/chain/tron/signing-strategy.js";
import { Keystore } from "../../../adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../../../adapters/outbound/persistence/fs/index.js";
import type { Ledger } from "../../../adapters/outbound/ledger/index.js";
import { WALLETS_VERSION } from "../../../domain/migration/wallets-v2.js";
import type { WalletsFile } from "../../../domain/types/index.js";

function freshKeystore() {
  const root = mkdtempSync(join(tmpdir(), "sr-"));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

// Two accounts sharing one EVM address but holding DIFFERENT tron addresses — same fixture
// shape as keystore.test.ts's keystoreWithDuplicateEvmAddress: on evm they hold the same key
// and are interchangeable, on tron "which one" changes what a command would act on.
const EVM_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function keystoreWithDuplicateEvmAddress(): Keystore {
  const root = mkdtempSync(join(tmpdir(), "sr-dup-"));
  const file: WalletsFile = {
    version: WALLETS_VERSION,
    activeAccount: null,
    wallets: [
      {
        id: "wlt_seed1",
        source: {
          type: "seed",
          vaultId: "vlt_seed1",
          addresses: { "0": { evm: EVM_ADDR, tron: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6" } },
        },
      },
      {
        id: "wlt_key1",
        source: {
          type: "privateKey",
          keyId: "key_key1",
          addresses: { evm: EVM_ADDR, tron: "TDpBe64DqirkKWj6HWuR3xtLoBqTAKitYb" },
        },
      },
    ],
    labels: {},
  };
  writeFileSync(join(root, "wallets.json"), JSON.stringify(file));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

describe("SignerResolver — watch accounts", () => {
  let ks: Keystore;
  let resolver: SignerResolver;
  beforeEach(() => {
    ks = freshKeystore();
    // ledger never touched for watch; strategies never touched (watch can't sign)
    resolver = new SignerResolver(ks, {} as unknown as Ledger, {
      tron: tronSignStrategy,
      evm: null as never, // never reached: watch accounts cannot sign
    });
  });

  it("refuses to sign for a watch-only account (watch_only_no_signer)", () => {
    const ref = ks.registerWatch({ family: "tron", address: "Twatch1" }).accountId;
    let err: { code?: string } | undefined;
    try {
      resolver.resolve(ref, "tron");
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("watch_only_no_signer");
  });

  it("assertCanSign rejects a watch-only account before any RPC/decrypt", () => {
    const ref = ks.registerWatch({ family: "tron", address: "Twatch1" }).accountId;
    let err: { code?: string } | undefined;
    try {
      resolver.assertCanSign(ref, "tron");
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("watch_only_no_signer");
  });

  it("assertCanSign passes for a signable (private-key) account", () => {
    // 32-byte test key → deterministic tron address; assertCanSign must not throw.
    const ref = ks.import({ type: "privateKey", secret: "0x".padEnd(66, "1") }).accountId;
    expect(() => resolver.assertCanSign(ref, "tron")).not.toThrow();
  });

  it("assertCanSign with requireSoftware rejects a Ledger account (ledger_unsupported)", () => {
    const ref = ks.registerLedger({
      family: "tron",
      path: "m/44'/195'/0'/0/0",
      address: "Tledger1",
    }).accountId;
    let err: { code?: string } | undefined;
    try {
      resolver.assertCanSign(ref, "tron", { requireSoftware: true });
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("ledger_unsupported");
  });

  // Same condition as resolveAddress: the account exists but lives on another chain. It reported
  // `missing_wallet_address`, which reads as "you have no account" — a different problem.
  it("reports family_mismatch for an account that has no address in the target family", () => {
    const ref = ks.registerLedger({
      family: "evm",
      path: "m/44'/60'/0'/0/0",
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    }).accountId;

    let code: string | undefined;
    try {
      resolver.assertCanSign(ref, "tron");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("family_mismatch");
  });

  // The message named the TRON app unconditionally. With one ledger-wired family that was
  // merely redundant; with two it tells an EVM user to blame the wrong application.
  it("names the family's own Ledger app when refusing", () => {
    const ref = ks.registerLedger({
      family: "evm",
      path: "m/44'/60'/0'/0/0",
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    }).accountId;

    expect(() => resolver.assertCanSign(ref, "evm", { requireSoftware: true })).toThrow(
      /ethereum/i,
    );
  });

  it("assertCanSign without requireSoftware still allows a Ledger account", () => {
    const ref = ks.registerLedger({
      family: "tron",
      path: "m/44'/195'/0'/0/0",
      address: "Tledger2",
    }).accountId;
    expect(() => resolver.assertCanSign(ref, "tron")).not.toThrow();
  });
});

describe("SignerResolver — resolving an address shared by two accounts", () => {
  it("picks either of two accounts sharing the address on the family being signed for", () => {
    const dupKs = keystoreWithDuplicateEvmAddress();
    const resolver = new SignerResolver(dupKs, {} as unknown as Ledger, {
      tron: tronSignStrategy,
      evm: tronSignStrategy, // signing itself is never reached in this test
    });
    expect(() => resolver.assertCanSign(EVM_ADDR, "evm")).not.toThrow();
  });

  it("refuses to sign on a family the address cannot narrow", () => {
    const dupKs = keystoreWithDuplicateEvmAddress();
    const resolver = new SignerResolver(dupKs, {} as unknown as Ledger, {
      tron: tronSignStrategy,
      evm: tronSignStrategy,
    });
    let code: string | undefined;
    try {
      resolver.assertCanSign(EVM_ADDR, "tron");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("ambiguous_account");
  });
});
