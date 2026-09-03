import { describe, it, expect, beforeEach, vi } from "vitest";
import { WALLETS_VERSION } from "../../../domain/migration/wallets-v2.js";

// Swap real scrypt (n=2^18, hundreds of ms/call) for a cheap deterministic KDF: this suite
// exercises keystore *logic* over dozens of encrypt/decrypt cycles, not the KDF, which
// crypto.test.ts covers against the real implementation. Production is untouched.
vi.mock(
  "@noble/hashes/scrypt.js",
  async () => import("../persistence/crypto/__test-support__/cheap-scrypt.js"),
);
import { mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Keystore, walletAddress } from "./index.js";
import type { CliError } from "../../../domain/errors/index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { Derivation } from "../../../domain/derivation/index.js";
import { TronAddress } from "../../../domain/address/index.js";
import type { WalletsFile } from "../../../domain/types/index.js";

const MNEMONIC = "test test test test test test test test test test test junk";
// the canonical TRON address derived from MNEMONIC at account 0 — the cached address every
// seed import below produces (computed once so tests don't hardcode a base58 string).
const TRON0 = new TronAddress().fromPublicKey(
  Derivation.derive(Derivation.mnemonicToSeed(MNEMONIC), Derivation.path("tron", 0)).publicKey,
);
// the raw private key MNEMONIC derives at m/44'/60'/0'/0/0 — importing this as a bare privateKey
// and then importing MNEMONIC as a seed makes the two land on the same EVM address via two
// DIFFERENT source kinds, which is the case findByAddress's ofType scoping exists for.
const EVM_KEY_OF_MNEMONIC_ACCOUNT_0 = bytesToHex(
  Derivation.derive(Derivation.mnemonicToSeed(MNEMONIC), Derivation.path("evm", 0)).privateKey,
);

function freshKeystore() {
  const root = mkdtempSync(join(tmpdir(), "ks-"));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

describe("Keystore", () => {
  let ks: Keystore;
  beforeEach(() => {
    ks = freshKeystore();
  });

  it("imports a seed, caches the chain address, and sets it active", () => {
    const { accountId: ref, created } = ks.import({
      secret: MNEMONIC,
      type: "seed",
      label: "main",
    });
    expect(ref).toMatch(/^wlt_[a-z0-9]+\.0$/);
    expect(created).toBe(true);
    const views = ks.list();
    expect(views).toHaveLength(1);
    expect(views[0]!.addresses.tron).toBe(TRON0);
    expect(views[0]!.addresses.tron?.startsWith("T")).toBe(true);
    expect(views[0]!.active).toBe(true);
    expect(views[0]!.label).toBe("main");
    expect(views[0]!.accountId).toBe(ref);
    expect(ks.activeAccount()).toBe(ref);
  });

  it("decrypts the seed back to the same derivation (round-trip)", () => {
    const { accountId: ref } = ks.import({ secret: MNEMONIC, type: "seed" });
    const { wallet, index } = ks.resolveAccount(ref);
    const vaultId = wallet.source.type === "seed" ? wallet.source.vaultId : "";
    const seed = ks.decryptSeed(vaultId);
    const kp = Derivation.derive(seed, Derivation.path("tron", index));
    // derive address again and compare against the cached one
    expect(bytesToHex(kp.privateKey)).toHaveLength(64);
    expect(walletAddress(wallet, "tron", 0)).toBe(TRON0);
  });

  it("imports a private key as a non-HD wallet (ref without index)", () => {
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1
    const { accountId: ref } = ks.import({ secret: pk, type: "privateKey", label: "hot" });
    expect(ref).toMatch(/^wlt_[a-z0-9]+$/);
    expect(ref).not.toContain(".");
    const { wallet, index } = ks.resolveAccount(ref);
    expect(index).toBe(-1);
    expect(wallet.source.type).toBe("privateKey");
  });

  it("dedupes a repeated import by address (created=false on the hit)", () => {
    const a = ks.import({ secret: MNEMONIC, type: "seed" });
    const b = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(b.accountId).toBe(a.accountId);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(ks.list()).toHaveLength(1);
  });

  it("keeps a repeated import of the same mnemonic idempotent", () => {
    const first = ks.import({ secret: MNEMONIC, type: "seed" });
    const second = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(second.created).toBe(false);
    expect(second.accountId).toBe(first.accountId);
  });

  it("stores the seed even when a privateKey account already holds that address", () => {
    // Before: findByAddress matched across source types, so this returned the existing
    // privateKey account and returned before the vault was written — the seed was silently
    // dropped, and `derive` then failed on an import the caller was told had succeeded.
    ks.import({ secret: EVM_KEY_OF_MNEMONIC_ACCOUNT_0, type: "privateKey" });
    const seeded = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(seeded.created).toBe(true);
    expect(ks.resolveAccount(seeded.accountId).wallet.source.type).toBe("seed");
  });

  it("makes every imported or derived SIGNING target active, including dedup hits", () => {
    const seed = ks.import({ secret: MNEMONIC, type: "seed", label: "seed" });
    const privateKey = ks.import({
      secret: "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      type: "privateKey",
      label: "hot",
    });
    expect(ks.activeAccount()).toBe(privateKey.accountId);

    const repeatedSeed = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(repeatedSeed.created).toBe(false);
    expect(ks.activeAccount()).toBe(seed.accountId);

    const ledger = ks.registerLedger({ family: "tron", path: "m/44'/195'/0'/0/0", address: TRON0 });
    expect(ks.activeAccount()).toBe(ledger.accountId);

    // A watch account is the exception: it holds no key, so making it active would turn
    // the next write command into watch_only_no_signer for a reason the user never chose.
    const watch = ks.registerWatch({ family: "tron", address: "Twatch-active" });
    expect(ks.activeAccount()).toBe(ledger.accountId);

    const repeatedLedger = ks.registerLedger({
      family: "tron",
      path: "m/44'/195'/0'/0/0",
      address: TRON0,
    });
    expect(repeatedLedger.created).toBe(false);
    expect(ks.activeAccount()).toBe(ledger.accountId);

    const derived = ks.addAccount(seed.accountId.split(".")[0]!, 1);
    expect(ks.activeAccount()).toBe(derived.accountId);

    ks.setActive(watch.accountId);
    const repeatedDerived = ks.addAccount(seed.accountId.split(".")[0]!, 1);
    expect(repeatedDerived.created).toBe(false);
    expect(ks.activeAccount()).toBe(derived.accountId);
  });

  const LEDGER_PATH = "m/44'/195'/0'/0/0";

  it("registerLedger does not dedup against a software account with the same address", () => {
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const ledRef = ks.registerLedger({
      family: "tron",
      path: LEDGER_PATH,
      address: TRON0,
    }).accountId;
    expect(ledRef).not.toBe(seedRef);
    expect(ks.list()).toHaveLength(2);
    expect(ks.resolveAccount(ledRef).wallet.source.type).toBe("ledger");
  });

  it("seed import stays independent of a pre-registered ledger of the same address", () => {
    ks.registerLedger({ family: "tron", path: LEDGER_PATH, address: TRON0 });
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    expect(ks.list()).toHaveLength(2);
    expect(ks.resolveAccount(seedRef).wallet.source.type).toBe("seed");
  });

  it("registerLedger dedupes by (family, path)", () => {
    const a = ks.registerLedger({ family: "tron", path: LEDGER_PATH, address: TRON0 });
    const b = ks.registerLedger({ family: "tron", path: LEDGER_PATH, address: TRON0 });
    expect(b.accountId).toBe(a.accountId);
    expect(b.created).toBe(false);
    expect(ks.list()).toHaveLength(1);
    // same family+path is the dedup key, independent of the supplied address string
    const c = ks.registerLedger({ family: "tron", path: LEDGER_PATH, address: "TDIFFERENT" });
    expect(c.accountId).toBe(a.accountId);
    expect(ks.list()).toHaveLength(1);
    // a different path is a distinct entry
    const d = ks.registerLedger({ family: "tron", path: "m/44'/195'/1'/0/0", address: "TOTHER" });
    expect(d.accountId).not.toBe(a.accountId);
    expect(d.created).toBe(true);
    expect(ks.list()).toHaveLength(2);
  });

  it("registerWatch stores a secret-less, index-less watch account", () => {
    const wRef = ks.registerWatch({ family: "tron", address: "Twatch1", label: "obs" }).accountId;
    expect(wRef).toMatch(/^wlt_[a-z0-9]+$/);
    expect(wRef).not.toContain(".");
    const { wallet, index } = ks.resolveAccount(wRef);
    expect(index).toBe(-1);
    expect(wallet.source.type).toBe("watch");
    expect(walletAddress(wallet, "tron")).toBe("Twatch1");
  });

  it("registerWatch dedupes by (family, address)", () => {
    const a = ks.registerWatch({ family: "tron", address: "Twatch1" });
    const b = ks.registerWatch({ family: "tron", address: "Twatch1" });
    expect(b.accountId).toBe(a.accountId);
    expect(b.created).toBe(false);
    expect(ks.list()).toHaveLength(1);
    // different family or address is a distinct entry (synthetic non-tron family via cast,
    // since only tron ships — exercises the (family,address) dedup key, not a real EVM watch)
    const c = ks.registerWatch({ family: "evm" as any, address: "Twatch1" });
    const d = ks.registerWatch({ family: "tron", address: "Twatch2" });
    expect(c.accountId).not.toBe(a.accountId);
    expect(d.accountId).not.toBe(a.accountId);
    expect(ks.list()).toHaveLength(3);
  });

  it("registerWatch stays independent of a software account with the same address", () => {
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const tronAddr = walletAddress(ks.resolveAccount(seedRef).wallet, "tron")!;
    const wRef = ks.registerWatch({ family: "tron", address: tronAddr }).accountId;
    expect(wRef).not.toBe(seedRef);
    expect(ks.list()).toHaveLength(2);
    // and a later seed re-import still dedups to the seed, not the watch
    expect(ks.import({ secret: MNEMONIC, type: "seed" }).accountId).toBe(seedRef);
  });

  it("add-account on a watch wallet is rejected", () => {
    const wRef = ks.registerWatch({ family: "tron", address: "Twatch1" }).accountId;
    expect(() => ks.addAccount(wRef.split(".")[0]!)).toThrow(/not HD/i);
  });

  it("add-account on a ledger wallet is rejected with a re-import hint", () => {
    const ledRef = ks.registerLedger({
      family: "tron",
      path: LEDGER_PATH,
      address: TRON0,
    }).accountId;
    const walletId = ledRef.split(".")[0]!;
    expect(() => ks.addAccount(walletId)).toThrow(/not HD|import/i);
  });

  it("addAccount appends the next HD index with fresh addresses", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    const added = ks.addAccount(walletId);
    expect(added.accountId).toBe(`${walletId}.1`);
    expect(added.created).toBe(true);
    const views = ks.list();
    expect(views).toHaveLength(2);
    expect(views[0]!.addresses.tron).not.toBe(views[1]!.addresses.tron);
  });

  it("addAccount derives an explicit index and is idempotent (created=false on re-derive)", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    const ref3 = ks.addAccount(walletId, 3);
    expect(ref3.accountId).toBe(`${walletId}.3`);
    expect(ref3.created).toBe(true);
    expect(ks.list()).toHaveLength(2); // account 0 + account 3 (skipped 1,2)
    const addr3 = ks.list().find((v) => v.accountId === ref3.accountId)!.addresses.tron;
    // re-deriving the same index is a no-op that returns the same ref/address, created=false
    const again = ks.addAccount(walletId, 3);
    expect(again.accountId).toBe(ref3.accountId);
    expect(again.created).toBe(false);
    expect(ks.list()).toHaveLength(2);
    expect(ks.list().find((v) => v.accountId === ref3.accountId)!.addresses.tron).toBe(addr3);
  });

  it("renames via unique labels and resolves by label", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed", label: "main" }).accountId;
    const r = ks.rename("main", "primary");
    expect(r.previousLabel).toBe("main");
    expect(r.label).toBe("primary");
    expect(ks.resolveAccount("primary").wallet.id).toBe(ref.split(".")[0]);
  });

  it("rejects a duplicate label", () => {
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    expect(() => ks.import({ secret: pk, type: "privateKey", label: "main" })).toThrow(
      /already in use/,
    );
  });

  it("setActive switches the active account and reports the previous", () => {
    const a = ks.import({ secret: MNEMONIC, type: "seed", label: "main" }).accountId;
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const b = ks.import({ secret: pk, type: "privateKey", label: "hot" }).accountId;
    expect(ks.activeAccount()).toBe(b);
    const res = ks.setActive("main");
    expect(res.accountId).toBe(a);
    expect(res.previous).toBe(b);
    expect(ks.activeAccount()).toBe(a);
  });

  it("round-trips a passphrase-protected seed (address matches signing key)", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed", passphrase: "25th-word" }).accountId;
    const { wallet, index } = ks.resolveAccount(ref);
    const vaultId = wallet.source.type === "seed" ? wallet.source.vaultId : "";
    // seed reconstructed from the vault must reproduce the cached (with-passphrase) address
    const seed = ks.decryptSeed(vaultId);
    const kp = Derivation.derive(seed, Derivation.path("tron", index));
    expect(new TronAddress().fromPublicKey(kp.publicKey)).toBe(walletAddress(wallet, "tron", 0));
    // and it must NOT equal the no-passphrase derivation
    expect(walletAddress(wallet, "tron", 0)).not.toBe(TRON0);
    // backup reveals the passphrase is set (without exposing its value)
    expect(ks.revealMnemonic(vaultId).passphraseSet).toBe(true);
  });

  it("rejects a malformed account ref", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    expect(() => ks.resolveAccount(`${walletId}.abc`)).toThrow(/invalid account ref/);
  });

  it("enforces one global master password across the keystore", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const alice = new Keystore(root, new AtomicFileStore(), () => "alice-pw-1A");
    alice.import({ secret: MNEMONIC, type: "seed" });
    // a second wallet imported under a DIFFERENT password must be rejected, not silently stored
    const bob = new Keystore(root, new AtomicFileStore(), () => "bob-pw-2B");
    expect(() => bob.import({ secret: pk, type: "privateKey" })).toThrow(
      /auth_failed|incorrect|does not match/i,
    );
    // the original password still works
    const alice2 = new Keystore(root, new AtomicFileStore(), () => "alice-pw-1A");
    expect(() => alice2.import({ secret: pk, type: "privateKey" })).not.toThrow();
  });

  it("multi-account seed: selecting the wallet layer is ambiguous and hard-errors", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId); // now has .0 and .1
    expect(() => ks.resolveAccount(walletId)).toThrow(/multi-account|specify an account/i);
    expect(ks.resolveAccount(`${walletId}.1`).index).toBe(1); // explicit ref still resolves
  });

  it("delete by account ref forgets only that HD account; the vault/secret survives", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId); // .1
    const del = ks.delete(`${walletId}.1`);
    expect(del.scope).toBe("account");
    expect(del.secretRemoved).toBe(false);
    const views = ks.list();
    expect(views).toHaveLength(1);
    expect(views[0]!.accountId).toBe(`${walletId}.0`);
    const vaultId = (ks.resolveAccount(`${walletId}.0`).wallet.source as any).vaultId;
    expect(() => ks.decryptSeed(vaultId)).not.toThrow();
  });

  it("delete by root ref (index 0) cascades to the whole wallet, taking its children and vault", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId; // .0
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId); // .1
    ks.addAccount(walletId); // .2
    const vaultId = (ks.resolveAccount(`${walletId}.0`).wallet.source as any).vaultId;
    const del = ks.delete(`${walletId}.0`);
    expect(del.scope).toBe("wallet");
    expect(del.secretRemoved).toBe(true);
    expect(ks.list()).toHaveLength(0);
    expect(() => ks.decryptSeed(vaultId)).toThrow(/missing vault/);
  });

  it("delete by wallet-level ref removes the whole seed wallet and its vault", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId);
    const vaultId = (ks.resolveAccount(`${walletId}.0`).wallet.source as any).vaultId;
    const del = ks.delete(walletId);
    expect(del.scope).toBe("wallet");
    expect(del.secretRemoved).toBe(true);
    expect(del.newActive).toBeNull();
    expect(ks.list()).toHaveLength(0);
    expect(() => ks.decryptSeed(vaultId)).toThrow(/missing vault/);
  });

  it("resolves an account by its cached address", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    expect(ks.resolveAccount(TRON0).wallet.id).toBe(ref.split(".")[0]);
  });

  it("rejects a wrong master password on decrypt", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const vaultId = (ks.resolveAccount(ref).wallet.source as any).vaultId;
    // build a keystore pointing at the same root
    const ks2 = new Keystore(
      (ks as any).walletsPath.replace(/\/wallets\.json$/, ""),
      new AtomicFileStore(),
      () => "wrongpw",
    );
    expect(() => ks2.decryptSeed(vaultId)).toThrow(/auth_failed|incorrect/);
  });
});

/**
 * The codes these three failures answer with.
 *
 * All three used to be `invalid_value` — the bucket every malformed option lands in. For a value
 * typed at a hidden prompt there is no field path in the envelope either, so the code was the only
 * thing the caller got, and it said nothing. The error-code index names all three.
 */
describe("lookup and secret-shape failures carry their own codes", () => {
  let ks: Keystore;
  beforeEach(() => {
    ks = freshKeystore();
  });

  it("reports a reference that matches no account as account_not_found", () => {
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });

    for (const ref of ["nosuchlabel", "wlt_doesnotexist", TRON0.replace(/.$/, "x")]) {
      expect(() => ks.resolveAccount(ref), ref).toThrowError(
        expect.objectContaining({ code: "account_not_found" }),
      );
    }
  });

  // account_not_found is a "--account foo doesn't exist" mistake: fix the flag and rerun, same as
  // its twin seed_not_found. It must exit 2, not 1.
  it("exits 2 for account_not_found, like its twin seed_not_found", () => {
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    for (const ref of ["nosuchlabel", "wlt_doesnotexist", TRON0.replace(/.$/, "x")]) {
      try {
        ks.resolveAccount(ref);
        expect.unreachable(ref);
      } catch (e) {
        expect((e as CliError).exitCode(), ref).toBe(2);
      }
    }
  });

  // An ambiguous reference is NOT the same failure: the value is valid and simply picks more than
  // one account, so the fix is to narrow it, not to go looking for a missing account.
  it("keeps invalid_value for a reference that matches more than one account", () => {
    const a = ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    ks.addAccount(a.accountId.split(".")[0]!, 1);

    expect(() => ks.resolveAccount(a.accountId.split(".")[0]!)).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("reports a bad recovery phrase as invalid_mnemonic", () => {
    expect(() => ks.import({ secret: "not a mnemonic at all", type: "seed" })).toThrowError(
      expect.objectContaining({ code: "invalid_mnemonic" }),
    );
  });

  // Both ways to mistype a private key answer the same, including the non-hex one — which
  // previously escaped as a REDACTED internal_error from the hex decoder.
  it("reports either shape of bad private key as invalid_private_key", () => {
    for (const bad of ["zz".repeat(32), "ab".repeat(31)]) {
      expect(() => ks.import({ secret: bad, type: "privateKey" }), bad).toThrowError(
        expect.objectContaining({ code: "invalid_private_key" }),
      );
    }
  });

  // BUG-V413-038: a scalar outside secp256k1's valid range [1, n-1] — all-zero, or at/past the
  // curve order (64 `f`s) — is a THIRD way to mistype a private key. It passes the hex and
  // length checks above, so it used to blow up inside derivePrivAddresses() and get REDACTED to
  // internal_error. It must report invalid_private_key, exit 1, the same as the other two shapes.
  it("reports an out-of-range scalar (all-zero or past the curve order) as invalid_private_key, not internal_error", () => {
    for (const bad of ["0".repeat(64), "f".repeat(64)]) {
      let error: unknown;
      try {
        ks.import({ secret: bad, type: "privateKey" });
      } catch (e) {
        error = e;
      }
      expect(error, bad).toBeInstanceOf(Error);
      expect((error as CliError).code, bad).toBe("invalid_private_key");
      expect((error as CliError).exitCode(), bad).toBe(1);
    }
  });

  it("still imports a private key within the valid range", () => {
    const { accountId } = ks.import({ secret: "a".repeat(64), type: "privateKey", label: "hot" });
    expect(accountId).toBeTruthy();
  });
});

/**
 * Two accounts can legitimately hold the same key: a seed account and a privateKey account,
 * derived/imported independently, can share one family's address (import's own dedup only
 * catches the two easy paths — this fixture writes wallets.json directly to exercise the case
 * Task 2 unlocks). The two accounts here share one EVM address but hold DIFFERENT tron
 * addresses, which is what makes "which one" matter on a TRON command but not on an EVM one.
 */
const EVM_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TRON_ADDR_SEED = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";

function keystoreWithDuplicateEvmAddress(): Keystore {
  const root = mkdtempSync(join(tmpdir(), "ks-dup-"));
  const file: WalletsFile = {
    version: WALLETS_VERSION,
    activeAccount: null,
    wallets: [
      {
        id: "wlt_seed1",
        source: {
          type: "seed",
          vaultId: "vlt_seed1",
          addresses: { "0": { evm: EVM_ADDR, tron: TRON_ADDR_SEED } },
        },
      },
      {
        id: "wlt_key1",
        source: {
          type: "privateKey",
          keyId: "key_key1",
          addresses: { evm: EVM_ADDR, tron: TRON0 },
        },
      },
    ],
    labels: {},
  };
  writeFileSync(join(root, "wallets.json"), JSON.stringify(file));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

describe("resolving an address held by more than one account", () => {
  it("returns the first match when the requested family is the address's own family", () => {
    // two accounts sharing one EVM address: they hold the SAME evm key, so on an EVM
    // network they are interchangeable and picking either is correct.
    const ks = keystoreWithDuplicateEvmAddress();
    expect(ks.resolveAccount(EVM_ADDR, "evm").wallet).toBeDefined();
  });

  it("refuses an evm address when the family being acted on is tron, before any ambiguity check", () => {
    // EVM_ADDR is an evm address; asking for it under family "tron" now fails on the
    // family mismatch itself (Task 1), before the scan that would otherwise find the two
    // accounts sharing it and report ambiguous_account.
    const ks = keystoreWithDuplicateEvmAddress();
    expect(() => ks.resolveAccount(EVM_ADDR, "tron")).toThrowError(
      expect.objectContaining({ code: "family_mismatch" }),
    );
  });

  it("refuses to guess when no family narrows the choice", () => {
    const ks = keystoreWithDuplicateEvmAddress();
    expect(() => ks.describe(EVM_ADDR)).toThrowError(
      expect.objectContaining({ code: "ambiguous_account" }),
    );
  });

  it("hands the caller the candidates it has to choose between", () => {
    const ks = keystoreWithDuplicateEvmAddress();
    try {
      ks.describe(EVM_ADDR);
      throw new Error("expected ambiguous_account");
    } catch (e) {
      const details = (e as { details?: Record<string, unknown> }).details ?? {};
      expect(details.accountIds).toHaveLength(2);
      expect(details.matches).toEqual([
        expect.objectContaining({ type: "seed" }),
        expect.objectContaining({ type: "privateKey" }),
      ]);
    }
  });

  // Fix round 1 regression: same family is NOT enough to say two candidates are interchangeable.
  // A watch account holds no secret at all — it only observes the address — so "pick either" would
  // silently swap in an account that cannot sign. registerWatch's own dedup only rejects a
  // duplicate watch entry (see its comment: "stays distinct from a software account with the same
  // address"), so a seed and a watch account CAN genuinely end up sharing one address through the
  // real import/registerWatch paths — this uses those real paths, not the hand-built fixture.
  it("refuses to guess when one of the candidates has no local key (watch)", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-watch-dup-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const evmAddr = ks.list()[0]!.addresses.evm!;
    ks.registerWatch({ family: "evm", address: evmAddr }); // real dup: not blocked by dedup

    expect(() => ks.resolveAccount(evmAddr, "evm")).toThrowError(
      expect.objectContaining({ code: "ambiguous_account" }),
    );
  });

  // Companion to the test above: confirm the fix didn't overshoot and start refusing the case
  // it is still supposed to allow — seed + privateKey both hold the evm key locally, so on the
  // evm family they remain interchangeable and the first match is still returned.
  it("still returns the first match when every candidate holds the key locally", () => {
    const ks = keystoreWithDuplicateEvmAddress();
    expect(ks.resolveAccount(EVM_ADDR, "evm").wallet).toBeDefined();
  });
});

function keystoreWithUnknownSourceType(): Keystore {
  const root = mkdtempSync(join(tmpdir(), "ks-unknown-source-"));
  const file: WalletsFile = {
    version: WALLETS_VERSION,
    activeAccount: null,
    wallets: [
      {
        id: "wlt_known",
        source: { type: "watch", family: "evm", address: EVM_ADDR },
      },
      // A source.type this build does not recognise — a newer format, or leftover from a
      // downgrade. Cast through unknown: WalletsFile's Source union does not (and should not)
      // include kinds this build has never heard of.
      {
        id: "wlt_future",
        source: {
          type: "quantum",
          addresses: { "0": { tron: TRON_ADDR_SEED } },
        } as unknown as WalletsFile["wallets"][number]["source"],
      },
    ],
    labels: {},
  };
  writeFileSync(join(root, "wallets.json"), JSON.stringify(file));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

describe("an account whose source kind this build does not know", () => {
  it("is skipped by list() instead of failing the whole listing", () => {
    const ks = keystoreWithUnknownSourceType();
    expect(ks.list().map((a) => a.accountId)).toEqual(["wlt_known"]);
    expect(ks.unreadable()).toEqual(["wlt_future"]);
  });

  // The regression that matters: delete removed the wallet, wrote the file, and only THEN read
  // SOURCE_KINDS[...].hasSecret for its receipt. The throw arrived after the write, so the
  // account was already gone from disk while the caller was told the command had failed.
  it("is not deleted by a delete that reports failure", () => {
    const ks = keystoreWithUnknownSourceType();
    const before = readFileSync(join(ks.walletsPath), "utf8");
    expect(() => ks.delete("wlt_future")).toThrowError(
      expect.objectContaining({ code: "encoding_error" }),
    );
    expect(readFileSync(join(ks.walletsPath), "utf8")).toBe(before);
  });

  it.each([
    ["resolveAccount", (ks: Keystore) => ks.resolveAccount("wlt_future")],
    ["resolveWallet", (ks: Keystore) => ks.resolveWallet("wlt_future")],
    ["describe", (ks: Keystore) => ks.describe("wlt_future")],
  ])("answers %s with encoding_error rather than a redacted internal_error", (_name, act) => {
    expect(() => act(keystoreWithUnknownSourceType())).toThrowError(
      expect.objectContaining({ code: "encoding_error" }),
    );
  });

  // One unreadable account must not cost every OTHER account its address lookup — the same
  // promise list() makes. The scan reached enumerateAddresses on the unknown kind and threw
  // before it could match the account the caller actually named.
  it("does not break address lookup for the accounts that are readable", () => {
    const ks = keystoreWithUnknownSourceType();
    expect(ks.resolveAccount(EVM_ADDR).wallet.id).toBe("wlt_known");
  });
});

// The account holds tron TRON0 and its own evm address — one seed, two chains. Before this fix,
// resolveAccount(evmAddr, "tron") silently returned the SAME account's tron address, one the
// caller never typed; on tx send that is funds leaving an address they did not name.
function keystoreWithSeedAccount(): { ks: Keystore; evmAddr: string } {
  const ks = freshKeystore();
  ks.import({ secret: MNEMONIC, type: "seed" });
  const evmAddr = ks.list()[0]!.addresses.evm!;
  return { ks, evmAddr };
}

describe("an address names one chain: --account cannot cross families", () => {
  it("refuses an address from another chain when a family is being acted on", () => {
    // The account holds both addresses, so this used to succeed and silently act on the
    // account's TRON address — an address the caller never typed.
    const { ks, evmAddr } = keystoreWithSeedAccount();
    expect(() => ks.resolveAccount(evmAddr, "tron")).toThrowError(
      expect.objectContaining({ code: "family_mismatch" }),
    );
  });

  it("answers the same way whether or not the cross-chain address is registered", () => {
    // Before: registered → silent switch; unregistered → account_not_found. Same mistake, two
    // answers. The check runs before the scan so both now say family_mismatch.
    const { ks } = keystoreWithSeedAccount();
    const unregisteredEvmAddr = "0x000000000000000000000000000000000000dEaD";
    expect(() => ks.resolveAccount(unregisteredEvmAddr, "tron")).toThrowError(
      expect.objectContaining({ code: "family_mismatch" }),
    );
  });

  it("still resolves an address of the family being acted on", () => {
    const { ks, evmAddr } = keystoreWithSeedAccount();
    expect(ks.resolveAccount(evmAddr, "evm").wallet).toBeDefined();
  });

  it("still resolves an address with no family in play, for wallet commands", () => {
    // backup/delete/rename/derive/use pass no family: they have no chain, so an address is
    // just a handle and looking it up across families is correct.
    const { ks, evmAddr } = keystoreWithSeedAccount();
    expect(ks.describe(evmAddr).accountId).toBeDefined();
  });
});

describe("password sentinel queries", () => {
  it("isInitialized flips after the first import; verifyPassword checks the sentinel", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-sentinel-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "Abcdef1!");
    expect(ks.isInitialized()).toBe(false);
    ks.import({ secret: "a".repeat(64), type: "privateKey" });
    expect(ks.isInitialized()).toBe(true);
    expect(ks.verifyPassword("Abcdef1!")).toBe(true);
    expect(ks.verifyPassword("wrong")).toBe(false);
  });
});

describe("changePassword", () => {
  it("re-encrypts every software blob and the verifier with the new password", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "OldPw1!aa");
    ks.import({ secret: MNEMONIC, type: "seed", label: "seed" });
    const keyRef = ks.import({
      secret: "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      type: "privateKey",
      label: "hot",
    }).accountId;
    const source = ks.resolveAccount(keyRef).wallet.source;
    const keyId = source.type === "privateKey" ? source.keyId : "";

    const receipt = ks.changePassword("OldPw1!aa", "NewPw2@bb");
    expect(receipt.count).toBe(2);
    expect(receipt.wallets).toHaveLength(2);
    expect(ks.verifyPassword("OldPw1!aa")).toBe(false);
    expect(ks.verifyPassword("NewPw2@bb")).toBe(true);
    const ks2 = new Keystore(root, store, () => "NewPw2@bb");
    expect(() => ks2.decryptKey(keyId)).not.toThrow();
  }, 15_000);

  it("rejects a wrong old password without touching any file", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "OldPw1!aa");
    ks.import({ secret: MNEMONIC, type: "seed" });
    expect(() => ks.changePassword("WrongPw1!x", "NewPw2@bb")).toThrow(/incorrect master password/);
    expect(ks.verifyPassword("OldPw1!aa")).toBe(true);
  });

  it("throws no_software_wallet when only watch/ledger wallets exist", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const ksWatchOnly = new Keystore(root, new AtomicFileStore(), () => "OldPw1!aa");
    ksWatchOnly.registerWatch({ family: "tron", address: "Twatch-only" });
    expect(() => ksWatchOnly.changePassword("OldPw1!aa", "NewPw2@bb")).toThrow(
      /no software wallet/,
    );
  });

  it("maps a write failure to io_error and leaves the keystore usable under the old password", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "OldPw1!aa");
    ks.import({ secret: MNEMONIC, type: "seed" });
    store.writeJsonAll = () => {
      throw new Error("disk full");
    };
    expect(() => ks.changePassword("OldPw1!aa", "NewPw2@bb")).toThrowError(
      expect.objectContaining({ code: "io_error" }),
    );
    expect(ks.verifyPassword("OldPw1!aa")).toBe(true);
  }, 15_000);

  // ── production crash-safety: the real backup/rollback/fsync commit loop ──────
  // Unlike the mock above (which throws before any file moves), these drive the ACTUAL
  // AtomicFileStore commit path a rotation uses — the code touched by the CP-03/CP-04 change.

  function residue(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".tmp") || p.includes(".bak")) out.push(p);
      }
    };
    walk(root);
    return out;
  }

  it("a partial mid-commit crash rolls back: every secret still opens with the OLD password, none with the new", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "OldPw1!aa");
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed", label: "seed" }).accountId;
    const keyRef = ks.import({
      secret: "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      type: "privateKey",
      label: "hot",
    }).accountId;
    const vaultId = (ks.resolveAccount(seedRef).wallet.source as any).vaultId;
    const keyId = (ks.resolveAccount(keyRef).wallet.source as any).keyId;

    // simulate a crash partway through the commit: let the first blob install, fail the next
    let installs = 0;
    store.commitRename = (from: string, to: string) => {
      if (from.includes(".tmp")) {
        installs++;
        if (installs === 2) throw Object.assign(new Error("EIO"), { code: "EIO" });
      }
      renameSync(from, to);
    };

    expect(() => ks.changePassword("OldPw1!aa", "NewPw2@bb")).toThrow();

    // rollback must leave a consistent OLD-password keystore — never a mixed set
    expect(ks.verifyPassword("OldPw1!aa")).toBe(true);
    expect(ks.verifyPassword("NewPw2@bb")).toBe(false);
    // both secrets must still decrypt under the old password via a fresh keystore reading from disk
    const reopened = new Keystore(root, new AtomicFileStore(), () => "OldPw1!aa");
    expect(() => reopened.decryptSeed(vaultId)).not.toThrow();
    expect(() => reopened.decryptKey(keyId)).not.toThrow();
    // clean rollback leaves no half-written temps or stray backups
    expect(residue(root)).toEqual([]);
  }, 15_000);

  it("a successful rotation lands durably with no .tmp/.bak residue (fsync + backup cleanup)", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "OldPw1!aa");
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed", label: "seed" }).accountId;
    const keyRef = ks.import({
      secret: "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      type: "privateKey",
      label: "hot",
    }).accountId;
    const vaultId = (ks.resolveAccount(seedRef).wallet.source as any).vaultId;
    const keyId = (ks.resolveAccount(keyRef).wallet.source as any).keyId;

    ks.changePassword("OldPw1!aa", "NewPw2@bb");

    // new password opens every blob through a fresh on-disk read; the backups are gone
    const reopened = new Keystore(root, new AtomicFileStore(), () => "NewPw2@bb");
    expect(() => reopened.decryptSeed(vaultId)).not.toThrow();
    expect(() => reopened.decryptKey(keyId)).not.toThrow();
    expect(residue(root)).toEqual([]);
  }, 15_000);
});

describe("wallets.json schema version", () => {
  // The synthesised default is not just read, it is PERSISTED on first write. A literal 1 here
  // would stamp every freshly created keystore as stale and send it straight to the migration
  // gate on its very next run.
  it("stamps a newly created keystore at the current version", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
    ks.registerWatch({ family: "tron", address: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6" });

    const doc = JSON.parse(readFileSync(join(root, "wallets.json"), "utf8"));

    expect(doc.version).toBe(WALLETS_VERSION);
  });
});

describe("descriptor carries each family's derivation path", () => {
  // Json had no path at all, so a user could not tell WHICH template an account used —
  // and the two families deliberately use different ones.
  it("gives a seed account one path per family", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    ks.addAccount(ks.list()[0]!.seedId!, 2);

    const account2 = ks.list().find((a) => a.index === 2)!;
    expect(account2.derivationPath).toEqual({
      tron: "m/44'/195'/2'/0/0",
      evm: "m/44'/60'/0'/0/2",
    });
  });

  // watch and private-key accounts were never derived from a template, so there is no path to
  // report — null says that, where an omitted field would just look like a gap.
  it("reports null for an account that was not derived", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
    ks.registerWatch({ family: "evm", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });

    expect(ks.list()[0]!.derivationPath).toBeNull();
  });

  // A Ledger account IS derived, at a path the user chose on the device — and it is single-family.
  it("gives a ledger account only its own family's path", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
    ks.registerLedger({
      family: "tron",
      path: "m/44'/195'/5'/0/0",
      address: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6",
    });

    expect(ks.list()[0]!.derivationPath).toEqual({ tron: "m/44'/195'/5'/0/0" });
  });
});
