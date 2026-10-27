import { describe, it, expect, beforeEach, vi } from "vitest";

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

// Same EVM address, different TRON addresses: ambiguity depends on the target family.
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
    resolver = new SignerResolver(ks, {} as unknown as Ledger, {
      tron: tronSignStrategy,
      evm: null as never,
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
      evm: tronSignStrategy,
    });
    expect(() => resolver.assertCanSign(EVM_ADDR, "evm")).not.toThrow();
  });

  it("refuses an evm address when signing on tron, before any ambiguity check", () => {
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
    expect(code).toBe("family_mismatch");
  });
});

it("prepares software key access without producing a signature", () => {
  const ks = freshKeystore();
  const ref = ks.import({
    type: "seed",
    secret: "test test test test test test test test test test test junk",
    label: "test",
  }).accountId;
  const decrypt = vi.spyOn(ks, "decryptSeed");
  const sign = vi.fn();
  const resolver = new SignerResolver(ks, {} as never, {
    tron: { ...tronSignStrategy, sign },
    evm: null as never,
  });
  resolver.prepare(ref, "tron");
  expect(decrypt).toHaveBeenCalledOnce();
  expect(sign).not.toHaveBeenCalled();
  decrypt.mockImplementation(() => {
    throw new Error("locked");
  });
  expect(() => resolver.prepare(ref, "tron")).toThrow("locked");
  expect(sign).not.toHaveBeenCalled();
});
