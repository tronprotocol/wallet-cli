import { describe, it, expect, vi } from "vitest";

vi.mock(
  "@noble/hashes/scrypt.js",
  async () =>
    import("../../../adapters/outbound/persistence/crypto/__test-support__/cheap-scrypt.js"),
);
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignerResolver } from "./index.js";
import { tronSignStrategy } from "../../../adapters/outbound/chain/tron/signing-strategy.js";
import { Keystore } from "../../../adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../../../adapters/outbound/persistence/fs/index.js";
import type { LedgerDevice } from "../../ports/ledger-device.js";
import type { WalletsFile } from "../../../domain/types/index.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const PW = "masterpw123A";
const TRON_LEGACY_1 = "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ"; // m/44'/195'/1'/0/0
const TRON_INDEX_0 = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"; // m/44'/195'/0'/0/0

// Inject a legacy-path address because the import API uses the current derivation template.
function keystoreWithLegacyAccount(): Keystore {
  const root = mkdtempSync(join(tmpdir(), "legacy-"));
  const store = new AtomicFileStore();
  const ks = new Keystore(root, store, () => PW);
  ks.import({ secret: MNEMONIC, type: "seed", label: "main" });

  const path = join(root, "wallets.json");
  const file = store.readJson<WalletsFile>(path)!;
  const source = file.wallets[0]!.source as Extract<
    WalletsFile["wallets"][0]["source"],
    { type: "seed" }
  >;
  source.addresses["1"] = {
    tron: TRON_LEGACY_1,
    evm: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  };
  store.writeJsonAll([{ path, value: file }]);
  return new Keystore(root, store, () => PW);
}

// Put the index-0 address at index 1 so neither derivation template matches.
function keystoreWithMismatchedAccount(): Keystore {
  const root = mkdtempSync(join(tmpdir(), "mismatch-"));
  const store = new AtomicFileStore();
  const ks = new Keystore(root, store, () => PW);
  ks.import({ secret: MNEMONIC, type: "seed", label: "main" });

  const path = join(root, "wallets.json");
  const file = store.readJson<WalletsFile>(path)!;
  const source = file.wallets[0]!.source as Extract<
    WalletsFile["wallets"][0]["source"],
    { type: "seed" }
  >;
  source.addresses["1"] = {
    tron: TRON_INDEX_0,
    evm: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  };
  store.writeJsonAll([{ path, value: file }]);
  return new Keystore(root, store, () => PW);
}

function resolverFor(ks: Keystore): SignerResolver {
  return new SignerResolver(ks, {} as LedgerDevice, { tron: tronSignStrategy } as never);
}

function seedId(ks: Keystore): string {
  return ks.list()[0]!.seedId!;
}

describe("signing an account left on the old TRON template", () => {
  it("resolves the signer without touching the seed", () => {
    const ks = keystoreWithLegacyAccount();
    const signer = resolverFor(ks).resolve(`${seedId(ks)}.1`, "tron");

    expect(signer.address).toBe(TRON_LEGACY_1);
  });

  it("throws legacy_derivation once the key is actually loaded", async () => {
    const ks = keystoreWithLegacyAccount();
    const signer = resolverFor(ks).resolve(`${seedId(ks)}.1`, "tron");

    await expect(signer.signMessage("hello", {} as never)).rejects.toMatchObject({
      code: "legacy_derivation",
    });
  });

  it("names the legacy path and the recovery guide", async () => {
    const ks = keystoreWithLegacyAccount();
    const signer = resolverFor(ks).resolve(`${seedId(ks)}.1`, "tron");

    const err = (await signer.signMessage("hello", {} as never).catch((e) => e)) as Error;
    expect(err.message).toContain("m/44'/195'/1'/0/0");
    expect(err.message).toContain("complete recovery procedure before deleting anything");
    expect(err.message).toContain("docs/troubleshooting/legacy-derivation-recovery.md");
    expect(err.message).not.toMatch(/wallet-cli (backup|import|delete)/);
    expect(err.message).not.toMatch(/recovery phrase|unique to wallet-cli|no other wallet/i);
  });

  it("uses the account label even when signing was requested by address", async () => {
    const ks = keystoreWithLegacyAccount();
    const ref = `${seedId(ks)}.1`;
    ks.rename(ref, "legacy account");
    const signer = resolverFor(ks).resolve(TRON_LEGACY_1, "tron");

    const err = (await signer.signMessage("hello", {} as never).catch((e) => e)) as Error;
    expect(err.message).toContain('account "legacy account"');
    expect(err.message).not.toContain(TRON_LEGACY_1);
  });

  it("signs an index-0 account normally, both templates agreeing there", async () => {
    const ks = keystoreWithLegacyAccount();
    const signer = resolverFor(ks).resolve(`${seedId(ks)}.0`, "tron");

    await expect(signer.signMessage("hello", {} as never)).resolves.toBeTypeOf("string");
  });

  it("throws derivation_mismatch when no template produces the stored address", async () => {
    const ks = keystoreWithMismatchedAccount();
    const signer = resolverFor(ks).resolve(`${seedId(ks)}.1`, "tron");

    await expect(signer.signMessage("hello", {} as never)).rejects.toMatchObject({
      code: "derivation_mismatch",
    });
  });
});
