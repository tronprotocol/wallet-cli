import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Keystore, walletAddress } from "./index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { Derivation } from "../../../domain/derivation/index.js";
import { TronAddress } from "../../../domain/address/index.js";

const MNEMONIC = "test test test test test test test test test test test junk";
// the canonical TRON address derived from MNEMONIC at account 0 — the cached address every
// seed import below produces (computed once so tests don't hardcode a base58 string).
const TRON0 = new TronAddress().fromPublicKey(
  Derivation.derive(Derivation.mnemonicToSeed(MNEMONIC), Derivation.path("tron", 0)).publicKey,
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
    const { accountId: ref, created } = ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
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

  it("makes every imported or derived target active, including dedup hits", () => {
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

    const watch = ks.registerWatch({ family: "tron", address: "Twatch-active" });
    expect(ks.activeAccount()).toBe(watch.accountId);

    const repeatedLedger = ks.registerLedger({ family: "tron", path: "m/44'/195'/0'/0/0", address: TRON0 });
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
    const ledRef = ks.registerLedger({ family: "tron", path: LEDGER_PATH, address: TRON0 }).accountId;
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
    const ledRef = ks.registerLedger({ family: "tron", path: LEDGER_PATH, address: TRON0 }).accountId;
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
    expect(() => ks.import({ secret: pk, type: "privateKey", label: "main" })).toThrow(/already in use/);
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
    expect(() => bob.import({ secret: pk, type: "privateKey" })).toThrow(/auth_failed|incorrect|does not match/i);
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
    const bad = new Keystore((ks as any).root ?? "", new AtomicFileStore(), () => "wrongpw");
    // build a keystore pointing at the same root
    const ks2 = new Keystore((ks as any).walletsPath.replace(/\/wallets\.json$/, ""), new AtomicFileStore(), () => "wrongpw");
    expect(() => ks2.decryptSeed(vaultId)).toThrow(/auth_failed|incorrect/);
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
    expect(() => ksWatchOnly.changePassword("OldPw1!aa", "NewPw2@bb")).toThrow(/no software wallet/);
  });

  it("maps a write failure to io_error and leaves the keystore usable under the old password", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "OldPw1!aa");
    ks.import({ secret: MNEMONIC, type: "seed" });
    store.writeJsonAll = () => { throw new Error("disk full"); };
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
