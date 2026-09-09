import { describe, it, expect, vi } from "vitest";

// Cheap KDF for keystore encryption in this suite. Production untouched.
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

/** A keystore holding one seed whose account 1 still carries the pre-correction address —
 *  what a wallets.json written by 4.13.0 looks like after one `derive`. The address is written
 *  straight into the file because addAccount now derives the corrected path (and, after Task 5,
 *  refuses this wallet outright), so no API can still produce this shape. */
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

/** A keystore whose index-1 address matches neither the current nor the legacy template — the
 *  index-0 address borrowed into that slot, which no derivation at index 1 produces under either
 *  scheme. This is the same trick Task 2's `derivation-match.test.ts` uses for its own no-match
 *  case, so both suites agree on what "mismatch" means: `wallets.json` and the vault disagree,
 *  which is a data-integrity fault distinct from `legacy_derivation` (a template match, just an
 *  old one) and must not be reported as the same thing. */
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

// Constructor order is (keystore, ledger, signStrategies) — see SignerResolver's declaration.
function resolverFor(ks: Keystore): SignerResolver {
  return new SignerResolver(ks, {} as LedgerDevice, { tron: tronSignStrategy } as never);
}

function seedId(ks: Keystore): string {
  return ks.list()[0]!.seedId!;
}

describe("signing an account left on the old TRON template", () => {
  // Resolving must stay free of the keystore: `tx send --dry-run` and `--build-only` resolve a
  // signer and never sign, and they take no master password. Throwing here would break them.
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

  // The message identifies the real path and sends the user to the complete, ordered recovery.
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

  // An unaffected account must not be dragged into the rescue flow: index 0 is the same path
  // under both templates, which is most users who never ran derive.
  it("signs an index-0 account normally, both templates agreeing there", async () => {
    const ks = keystoreWithLegacyAccount();
    const signer = resolverFor(ks).resolve(`${seedId(ks)}.0`, "tron");

    await expect(signer.signMessage("hello", {} as never)).resolves.toBeTypeOf("string");
  });

  // A different failure from legacy_derivation: no template matches at all, so the seed cannot
  // produce this address under any scheme. This is wallets.json and the vault disagreeing — a
  // hand-edited file or a wallet pointing at the wrong vault — not an account this CLI once
  // derived and now derives differently, so it must not be collapsed into the legacy code.
  it("throws derivation_mismatch when no template produces the stored address", async () => {
    const ks = keystoreWithMismatchedAccount();
    const signer = resolverFor(ks).resolve(`${seedId(ks)}.1`, "tron");

    await expect(signer.signMessage("hello", {} as never)).rejects.toMatchObject({
      code: "derivation_mismatch",
    });
  });
});
