import { describe, it, expect, beforeEach, vi } from "vitest";
import { WALLETS_VERSION } from "../../../domain/migration/wallets-v2.js";

// Use a cheap deterministic KDF to keep repeated keystore operations fast.
vi.mock(
  "@noble/hashes/scrypt.js",
  async () => import("../persistence/crypto/__test-support__/cheap-scrypt.js"),
);
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Keystore, walletAddress } from "./index.js";
import { followUp, type CliError } from "../../../domain/errors/index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { Derivation } from "../../../domain/derivation/index.js";
import { TronAddress } from "../../../domain/address/index.js";
import type { WalletsFile } from "../../../domain/types/index.js";
import { errorEnvelope, exitCodeOf } from "../../inbound/cli/output/errors.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const TRON0 = new TronAddress().fromPublicKey(
  Derivation.derive(Derivation.mnemonicToSeed(MNEMONIC), Derivation.path("tron", 0)).publicKey,
);
const EVM_KEY_OF_MNEMONIC_ACCOUNT_0 = bytesToHex(
  Derivation.derive(Derivation.mnemonicToSeed(MNEMONIC), Derivation.path("evm", 0)).privateKey,
);

function freshKeystore() {
  const root = mkdtempSync(join(tmpdir(), "ks-"));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
}

function storageSnapshot(root: string): Record<string, Buffer | null> {
  const snapshot: Record<string, Buffer | null> = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      snapshot[entry.name] = null;
      for (const [relative, bytes] of Object.entries(storageSnapshot(path))) {
        snapshot[join(entry.name, relative)] = bytes;
      }
    } else {
      snapshot[entry.name] = readFileSync(path);
    }
  }
  return snapshot;
}

const NEW_IMPORTS = [
  { type: "seed", secret: MNEMONIC, passphrase: "distinct seed" },
  { type: "privateKey", secret: EVM_KEY_OF_MNEMONIC_ACCOUNT_0 },
] as const;

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
    expect(bytesToHex(kp.privateKey)).toHaveLength(64);
    expect(walletAddress(wallet, "tron", 0)).toBe(TRON0);
  });

  it("imports a private key as a non-HD wallet (ref without index)", () => {
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
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

    const watch = ks.registerWatch({
      family: "tron",
      address: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
    });
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
    const c = ks.registerLedger({
      family: "tron",
      path: LEDGER_PATH,
      address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
    });
    expect(c.accountId).toBe(a.accountId);
    expect(ks.list()).toHaveLength(1);
    const d = ks.registerLedger({
      family: "tron",
      path: "m/44'/195'/1'/0/0",
      address: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
    });
    expect(d.accountId).not.toBe(a.accountId);
    expect(d.created).toBe(true);
    expect(ks.list()).toHaveLength(2);
  });

  it("registerWatch stores a secret-less, index-less watch account", () => {
    const wRef = ks.registerWatch({
      family: "tron",
      address: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
      label: "obs",
    }).accountId;
    expect(wRef).toMatch(/^wlt_[a-z0-9]+$/);
    expect(wRef).not.toContain(".");
    const { wallet, index } = ks.resolveAccount(wRef);
    expect(index).toBe(-1);
    expect(wallet.source.type).toBe("watch");
    expect(walletAddress(wallet, "tron")).toBe("TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC");
  });

  it("registerWatch dedupes by (family, address)", () => {
    const a = ks.registerWatch({ family: "tron", address: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC" });
    const b = ks.registerWatch({ family: "tron", address: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC" });
    expect(b.accountId).toBe(a.accountId);
    expect(b.created).toBe(false);
    expect(ks.list()).toHaveLength(1);
    const c = ks.registerWatch({
      family: "evm",
      address: "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D",
    });
    const d = ks.registerWatch({ family: "tron", address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8" });
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
    expect(ks.import({ secret: MNEMONIC, type: "seed" }).accountId).toBe(seedRef);
  });

  it("add-account on a watch wallet is rejected", () => {
    const wRef = ks.registerWatch({
      family: "tron",
      address: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
    }).accountId;
    expect(() => ks.addAccount(wRef.split(".")[0]!)).toThrow(/not HD/i);
  });

  it("add-account on a ledger wallet is rejected with a re-import hint", () => {
    const ledRef = ks.registerLedger({
      family: "tron",
      path: LEDGER_PATH,
      address: TRON0,
    }).accountId;
    const walletId = ledRef.split(".")[0]!;
    let error: CliError | undefined;
    try {
      ks.addAccount(walletId);
    } catch (caught) {
      error = caught as CliError;
    }
    expect(error?.parts).toContainEqual(followUp("ledger-import"));
    expect(errorEnvelope(error!)).toEqual({
      code: "seed_not_found",
      message:
        "ledger wallets are not HD; cannot add accounts — import another path with 'import ledger'",
    });
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
    expect(ks.list()).toHaveLength(2);
    const addr3 = ks.list().find((v) => v.accountId === ref3.accountId)!.addresses.tron;
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

  it.each(NEW_IMPORTS)("rejects a duplicate label without persisting a $type blob", (input) => {
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const active = ks.activeAccount();
    const before = storageSnapshot(dirname(ks.walletsPath));

    expect(() => ks.import({ ...input, label: " MAIN " })).toThrow(/already in use/);

    expect(ks.activeAccount()).toBe(active);
    expect(storageSnapshot(dirname(ks.walletsPath))).toEqual(before);
  });

  describe.each(["watch", "ledger"] as const)("with only a %s account", (type) => {
    it.each(NEW_IMPORTS)(
      "rejects a duplicate label without establishing a $type password",
      (input) => {
        if (type === "watch") {
          ks.registerWatch({ family: "tron", address: TRON0, label: "main" });
        } else {
          ks.registerLedger({ family: "tron", path: LEDGER_PATH, address: TRON0, label: "main" });
        }
        const active = ks.activeAccount();
        const before = storageSnapshot(dirname(ks.walletsPath));
        expect(before["verifier.json"]).toBeUndefined();

        expect(() => ks.import({ ...input, label: "main" })).toThrow(/already in use/);

        expect(ks.activeAccount()).toBe(active);
        expect(storageSnapshot(dirname(ks.walletsPath))).toEqual(before);
      },
    );
  });

  it.each(NEW_IMPORTS)(
    "reactivates a duplicate $type before checking its requested label",
    (input) => {
      const original = ks.import({ ...input, label: "original" });
      const watch = ks.registerWatch({ family: "tron", address: TRON0, label: "occupied" });
      ks.setActive(watch.accountId);
      const before = storageSnapshot(dirname(ks.walletsPath));
      const registry = JSON.parse(before["wallets.json"]!.toString()) as WalletsFile;

      expect(ks.import({ ...input, label: "occupied" })).toEqual({
        accountId: original.accountId,
        created: false,
      });

      expect(ks.activeAccount()).toBe(original.accountId);
      registry.activeAccount = original.accountId;
      before["wallets.json"] = Buffer.from(JSON.stringify(registry, null, 2) + "\n");
      expect(storageSnapshot(dirname(ks.walletsPath))).toEqual(before);
    },
  );

  it("keeps default labels numbered from one and skips occupied names", () => {
    ks.import({ secret: MNEMONIC, type: "seed" });
    ks.import({ secret: EVM_KEY_OF_MNEMONIC_ACCOUNT_0, type: "privateKey" });
    ks.registerWatch({ family: "tron", address: TRON0, label: "wallet-4" });
    ks.import({ secret: MNEMONIC, type: "seed", passphrase: "distinct seed" });

    expect(ks.list().map((account) => account.label)).toEqual([
      "wallet-1",
      "wallet-2",
      "wallet-4",
      "wallet-5",
    ]);
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
    const seed = ks.decryptSeed(vaultId);
    const kp = Derivation.derive(seed, Derivation.path("tron", index));
    expect(new TronAddress().fromPublicKey(kp.publicKey)).toBe(walletAddress(wallet, "tron", 0));
    expect(walletAddress(wallet, "tron", 0)).not.toBe(TRON0);
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
    const bob = new Keystore(root, new AtomicFileStore(), () => "bob-pw-2B");
    expect(() => bob.import({ secret: pk, type: "privateKey" })).toThrow(
      /auth_failed|incorrect|does not match/i,
    );
    const alice2 = new Keystore(root, new AtomicFileStore(), () => "alice-pw-1A");
    expect(() => alice2.import({ secret: pk, type: "privateKey" })).not.toThrow();
  });

  it("multi-account seed: selecting the wallet layer is ambiguous and hard-errors", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId);
    expect(() => ks.resolveAccount(walletId)).toThrow(/multi-account|specify an account/i);
    expect(ks.resolveAccount(`${walletId}.1`).index).toBe(1);
  });

  it("delete by account ref forgets only that HD account; the vault/secret survives", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId);
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
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId);
    ks.addAccount(walletId);
    const vaultId = (ks.resolveAccount(`${walletId}.0`).wallet.source as any).vaultId;
    const del = ks.delete(`${walletId}.0`);
    expect(del.scope).toBe("wallet");
    expect(del.secretRemoved).toBe(true);
    expect(ks.list()).toHaveLength(0);
    expect(() => ks.decryptSeed(vaultId)).toThrow(/missing vault/);
  });

  it.each([
    ["the whole wallet", false],
    ["the only remaining sub-account", true],
  ])("deleting %s keeps the secret file while the index still names it", (_label, subAccount) => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
    const walletId = ref.split(".")[0]!;
    const vaultId = (ks.resolveAccount(ref).wallet.source as any).vaultId;
    let target = walletId;
    if (subAccount) {
      ks.addAccount(walletId, 1);
      const file = JSON.parse(readFileSync(ks.walletsPath, "utf8")) as WalletsFile;
      delete (file.wallets[0]!.source as any).addresses["0"];
      writeFileSync(ks.walletsPath, JSON.stringify(file));
      target = `${walletId}.1`;
    }
    const before = readFileSync(ks.walletsPath, "utf8");
    const store = (ks as any).store as AtomicFileStore;
    store.writeJson = () => {
      throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
    };

    expect(() => ks.delete(target)).toThrow(/ENOSPC/);
    expect(readFileSync(ks.walletsPath, "utf8")).toBe(before);
    expect(() => ks.decryptSeed(vaultId)).not.toThrow();
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports secretRemoved false when the secret file cannot be deleted after the index commit",
    () => {
      const ref = ks.import({ secret: MNEMONIC, type: "seed" }).accountId;
      const vaults = join(dirname((ks as any).walletsPath), "vaults");
      chmodSync(vaults, 0o500);
      try {
        const del = ks.delete(ref.split(".")[0]!);
        expect(del.secretRemoved).toBe(false);
        expect(ks.list()).toEqual([]);
      } finally {
        chmodSync(vaults, 0o700);
      }
    },
  );

  it.each(["seed", "privateKey"] as const)(
    "names the %s secret file that could not be deleted after the index commit",
    (type) => {
      const secret = type === "seed" ? MNEMONIC : EVM_KEY_OF_MNEMONIC_ACCOUNT_0;
      const ref = ks.import({ secret, type }).accountId;
      const source = ks.resolveAccount(ref).wallet.source as any;
      const blob =
        type === "seed"
          ? join(dirname(ks.walletsPath), "vaults", `${source.vaultId}.json`)
          : join(dirname(ks.walletsPath), "keys", `${source.keyId}.json`);
      vi.mocked(rmSync).mockImplementationOnce(() => {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      });

      const del = ks.delete(ref.split(".")[0]!);

      expect(del).toMatchObject({ secretRemoved: false, retainedSecretFile: blob });
      expect(ks.list()).toEqual([]);
      expect(readFileSync(blob, "utf8")).not.toBe("");
    },
  );

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
    const ks2 = new Keystore(
      (ks as any).walletsPath.replace(/\/wallets\.json$/, ""),
      new AtomicFileStore(),
      () => "wrongpw",
    );
    expect(() => ks2.decryptSeed(vaultId)).toThrow(/auth_failed|incorrect/);
  });
});

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

  it("exits 2 for account_not_found, like its twin seed_not_found", () => {
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    for (const ref of ["nosuchlabel", "wlt_doesnotexist", TRON0.replace(/.$/, "x")]) {
      try {
        ks.resolveAccount(ref);
        expect.unreachable(ref);
      } catch (e) {
        expect(exitCodeOf(e as CliError), ref).toBe(2);
      }
    }
  });

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

  it("reports either shape of bad private key as invalid_private_key", () => {
    for (const bad of ["zz".repeat(32), "ab".repeat(31)]) {
      expect(() => ks.import({ secret: bad, type: "privateKey" }), bad).toThrowError(
        expect.objectContaining({ code: "invalid_private_key" }),
      );
    }
  });

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
      expect(exitCodeOf(error as CliError), bad).toBe(1);
    }
  });

  it("still imports a private key within the valid range", () => {
    const { accountId } = ks.import({ secret: "a".repeat(64), type: "privateKey", label: "hot" });
    expect(accountId).toBeTruthy();
  });
});

// The fixture shares an EVM address across source kinds.
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
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
}

describe("resolving an address held by more than one account", () => {
  it("returns the first match when the requested family is the address's own family", () => {
    const ks = keystoreWithDuplicateEvmAddress();
    expect(ks.resolveAccount(EVM_ADDR, "evm").wallet).toBeDefined();
  });

  it("refuses an evm address when the family being acted on is tron, before any ambiguity check", () => {
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

  it("refuses to guess when one of the candidates has no local key (watch)", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-watch-dup-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const evmAddr = ks.list()[0]!.addresses.evm!;
    ks.registerWatch({ family: "evm", address: evmAddr });

    expect(() => ks.resolveAccount(evmAddr, "evm")).toThrowError(
      expect.objectContaining({ code: "ambiguous_account" }),
    );
  });

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
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
}

describe("an account whose source kind this build does not know", () => {
  it("is skipped by list() instead of failing the whole listing", () => {
    const ks = keystoreWithUnknownSourceType();
    expect(ks.list().map((a) => a.accountId)).toEqual(["wlt_known"]);
    expect(ks.unreadable()).toEqual(["wlt_future"]);
  });

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

  it("does not break address lookup for the accounts that are readable", () => {
    const ks = keystoreWithUnknownSourceType();
    expect(ks.resolveAccount(EVM_ADDR).wallet.id).toBe("wlt_known");
  });
});

function keystoreWithSeedAccount(): { ks: Keystore; evmAddr: string } {
  const ks = freshKeystore();
  ks.import({ secret: MNEMONIC, type: "seed" });
  const evmAddr = ks.list()[0]!.addresses.evm!;
  return { ks, evmAddr };
}

describe("an address names one chain: --account cannot cross families", () => {
  it("refuses an address from another chain when a family is being acted on", () => {
    const { ks, evmAddr } = keystoreWithSeedAccount();
    expect(() => ks.resolveAccount(evmAddr, "tron")).toThrowError(
      expect.objectContaining({ code: "family_mismatch" }),
    );
  });

  it("answers the same way whether or not the cross-chain address is registered", () => {
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

  it("refuses to create the sentinel with a password that fails the policy", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-sentinel-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "weakpass");
    expect(() => ks.import({ secret: "a".repeat(64), type: "privateKey" })).toThrowError(
      expect.objectContaining({ code: "weak_password" }),
    );
    expect(ks.isInitialized()).toBe(false);
    expect(readdirSync(root)).not.toContain("wallets.json");
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
    ksWatchOnly.registerWatch({ family: "tron", address: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC" });
    expect(() => ksWatchOnly.changePassword("OldPw1!aa", "NewPw2@bb")).toThrow(
      /no software wallet/,
    );
  });

  function twoWallets(root: string, store: AtomicFileStore) {
    const ks = new Keystore(root, store, () => "OldPw1!aa");
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed", label: "seed" }).accountId;
    const keyRef = ks.import({
      secret: "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      type: "privateKey",
      label: "hot",
    }).accountId;
    const vaultId = (ks.resolveAccount(seedRef).wallet.source as any).vaultId as string;
    const keyId = (ks.resolveAccount(keyRef).wallet.source as any).keyId as string;
    return { ks, vaultId, keyId };
  }

  // Restarts on root and reports the one password that opens the verifier and every secret.
  function passwordAfterRestart(root: string, vaultId: string, keyId: string): string[] {
    return ["OldPw1!aa", "NewPw2@bb"].filter((pw) => {
      const reopened = new Keystore(root, new AtomicFileStore(), () => pw);
      if (!reopened.verifyPassword(pw)) return false;
      reopened.decryptSeed(vaultId);
      reopened.decryptKey(keyId);
      return true;
    });
  }

  function residue(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tmp|next|lock)$|\.bak|journal/.test(p)) out.push(p);
      }
    };
    walk(root);
    return out;
  }

  it("keeps the old password and leaves no staged files when staging fails", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const { ks, vaultId, keyId } = twoWallets(root, store);
    const fsyncFile = store.fsyncFile.bind(store);
    let staged = 0;
    store.fsyncFile = (path: string) => {
      if (path.endsWith(".next") && ++staged === 2) {
        throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
      }
      fsyncFile(path);
    };

    expect(() => ks.changePassword("OldPw1!aa", "NewPw2@bb")).toThrowError(
      expect.objectContaining({ code: "io_error", message: expect.stringMatching(/old password/) }),
    );
    expect(residue(root)).toEqual([]);
    expect(passwordAfterRestart(root, vaultId, keyId)).toEqual(["OldPw1!aa"]);
  }, 15_000);

  it("reports a failure after the commit point truthfully and finishes on the next command", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const { ks, vaultId, keyId } = twoWallets(root, store);
    let installs = 0;
    store.commitRename = (from: string, to: string) => {
      if (++installs === 2) throw Object.assign(new Error("EIO"), { code: "EIO" });
      renameSync(from, to);
    };

    expect(() => ks.changePassword("OldPw1!aa", "NewPw2@bb")).toThrowError(
      expect.objectContaining({
        code: "io_error",
        message: expect.stringMatching(/new password is in effect/),
      }),
    );
    expect(passwordAfterRestart(root, vaultId, keyId)).toEqual(["NewPw2@bb"]);
    expect(residue(root)).toEqual([]);
  }, 15_000);

  it("a process killed at any step restarts with exactly one password: old before the commit point, new after", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-change-password-"));
    const store = new AtomicFileStore();
    const { ks, vaultId, keyId } = twoWallets(root, store);
    const snapshots: string[] = [];
    // A copy of root taken mid-operation is the state a killed process leaves behind.
    const snapshot = () => {
      const copy = mkdtempSync(join(tmpdir(), "ks-killed-"));
      cpSync(root, copy, { recursive: true });
      rmSync(join(copy, "wallets.json.lock"), { force: true });
      snapshots.push(copy);
    };
    const fsyncFile = store.fsyncFile.bind(store);
    store.fsyncFile = (path: string) => {
      fsyncFile(path);
      snapshot();
    };
    store.commitRename = (from: string, to: string) => {
      snapshot();
      renameSync(from, to);
      snapshot();
    };

    ks.changePassword("OldPw1!aa", "NewPw2@bb");

    const outcomes = snapshots.map((copy) => passwordAfterRestart(copy, vaultId, keyId));
    for (const [i, copy] of snapshots.entries()) {
      expect(outcomes[i], `kill point ${i}`).toHaveLength(1);
      // The next wallet command recovers, including a temp file of an interrupted journal write.
      const { activeAccount } = JSON.parse(readFileSync(join(copy, "wallets.json"), "utf8"));
      new Keystore(copy, new AtomicFileStore(), () => outcomes[i]![0]!).setActive(activeAccount);
      expect(residue(copy), `kill point ${i}`).toEqual([]);
    }
    const sequence = outcomes.map((o) => o[0]);
    const firstNew = sequence.indexOf("NewPw2@bb");
    expect(firstNew).toBeGreaterThan(1);
    expect(sequence.slice(0, firstNew).every((pw) => pw === "OldPw1!aa")).toBe(true);
    expect(sequence.slice(firstNew).every((pw) => pw === "NewPw2@bb")).toBe(true);
    expect(sequence.length - firstNew).toBeGreaterThan(1);
  }, 60_000);

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

    const reopened = new Keystore(root, new AtomicFileStore(), () => "NewPw2@bb");
    expect(() => reopened.decryptSeed(vaultId)).not.toThrow();
    expect(() => reopened.decryptKey(keyId)).not.toThrow();
    expect(residue(root)).toEqual([]);
  }, 15_000);
});

describe("wallets.json loading applies the write rules", () => {
  it("rejects a hand-edited watch address that registerWatch would refuse", () => {
    const ks = freshKeystore();
    ks.registerWatch({ family: "tron", address: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6" });
    const file = JSON.parse(readFileSync(ks.walletsPath, "utf8")) as WalletsFile;
    (file.wallets[0]!.source as { address: string }).address = "Tnot-an-address";
    writeFileSync(ks.walletsPath, JSON.stringify(file));

    expect(() => ks.list()).toThrowError(expect.objectContaining({ code: "encoding_error" }));
    expect(() => ks.registerWatch({ family: "tron", address: "Tnot-an-address" })).toThrowError(
      expect.objectContaining({ code: "invalid_address" }),
    );
  });
});

describe("wallets.json schema version", () => {
  it("stamps a newly created keystore at the current version", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
    ks.registerWatch({ family: "tron", address: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6" });

    const doc = JSON.parse(readFileSync(join(root, "wallets.json"), "utf8"));

    expect(doc.version).toBe(WALLETS_VERSION);
  });
});

describe("descriptor carries each family's derivation path", () => {
  it("reports no derivation information when one family's path is ambiguous", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    ks.addAccount(ks.list()[0]!.seedId!, 2);

    const account2 = ks.list().find((a) => a.index === 2)!;
    expect(account2.derivationPath).toBeNull();
  });

  it("still reports both paths for index 0, where the templates agree", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });

    expect(ks.list()[0]!.derivationPath).toEqual({
      tron: "m/44'/195'/0'/0/0",
      evm: "m/44'/60'/0'/0/0",
    });
  });

  it("reports null for an account that was not derived", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
    ks.registerWatch({ family: "evm", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });

    expect(ks.list()[0]!.derivationPath).toBeNull();
  });

  it("gives a ledger account only its own family's path", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
    ks.registerLedger({
      family: "tron",
      path: "m/44'/195'/5'/0/0",
      address: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6",
    });

    expect(ks.list()[0]!.derivationPath).toEqual({ tron: "m/44'/195'/5'/0/0" });
  });
});

describe("derive on a wallet holding a pre-correction account", () => {
  const TRON_LEGACY_1 = "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ"; // m/44'/195'/1'/0/0

  function keystoreWithLegacyAccount() {
    const root = mkdtempSync(join(tmpdir(), "ks-legacy-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "masterpw123A!");
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
    return new Keystore(root, store, () => "masterpw123A!");
  }

  it("refuses, rather than adding a second template to the same wallet", () => {
    const ks = keystoreWithLegacyAccount();
    expect(() => ks.addAccount(ks.list()[0]!.seedId!)).toThrowError(
      expect.objectContaining({ code: "legacy_derivation" }),
    );
  });

  it("identifies the wallet and stranded account by label", () => {
    const ks = keystoreWithLegacyAccount();
    const seedId = ks.list()[0]!.seedId!;
    ks.rename(`${seedId}.1`, "legacy account");

    let message = "";
    try {
      ks.addAccount(seedId);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('wallet "main" holds account "legacy account"');
    expect(message).toContain("complete recovery procedure before deleting anything");
    expect(message).toContain("docs/troubleshooting/legacy-derivation-recovery.md");
    expect(message).not.toContain(`${seedId}.1`);
  });

  it("still re-activates an existing index rather than refusing", () => {
    const ks = keystoreWithLegacyAccount();
    const seedId = ks.list()[0]!.seedId!;

    const result = ks.addAccount(seedId, 0);

    expect(result).toEqual({ accountId: `${seedId}.0`, created: false });
  });

  it("re-activates the stranded slot itself without refusing", () => {
    const ks = keystoreWithLegacyAccount();
    const seedId = ks.list()[0]!.seedId!;

    expect(ks.addAccount(seedId, 1)).toEqual({ accountId: `${seedId}.1`, created: false });
  });

  it("refuses with derivation_mismatch when a slot matches no template at all", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-mismatch-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "masterpw123A!");
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const path = join(root, "wallets.json");
    const file = store.readJson<WalletsFile>(path)!;
    const source = file.wallets[0]!.source as Extract<
      WalletsFile["wallets"][0]["source"],
      { type: "seed" }
    >;
    // Index 0 is cached at index 1, where neither TRON template produces it.
    source.addresses["1"] = {
      tron: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6",
      evm: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };
    store.writeJsonAll([{ path, value: file }]);
    const fresh = new Keystore(root, store, () => "masterpw123A!");

    expect(() => fresh.addAccount(fresh.list()[0]!.seedId!)).toThrowError(
      expect.objectContaining({ code: "derivation_mismatch" }),
    );
  });

  it("does not change the active account when an existing slot fails verification", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-mismatch-existing-"));
    const store = new AtomicFileStore();
    const ks = new Keystore(root, store, () => "masterpw123A!");
    const rootRef = ks.import({ secret: MNEMONIC, type: "seed", label: "main" }).accountId;
    const path = join(root, "wallets.json");
    const file = store.readJson<WalletsFile>(path)!;
    const source = file.wallets[0]!.source as Extract<
      WalletsFile["wallets"][0]["source"],
      { type: "seed" }
    >;
    source.addresses["1"] = {
      tron: "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6",
      evm: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };
    store.writeJsonAll([{ path, value: file }]);
    const fresh = new Keystore(root, store, () => "masterpw123A!");

    expect(() => fresh.addAccount(rootRef.split(".")[0]!, 1)).toThrowError(
      expect.objectContaining({ code: "derivation_mismatch" }),
    );
    expect(fresh.activeAccount()).toBe(rootRef);
  });

  it("allows a wallet that only ever held index 0", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-clean-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => "masterpw123A!");
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });

    const result = ks.addAccount(ks.list()[0]!.seedId!);
    expect(result.created).toBe(true);
  });
});
