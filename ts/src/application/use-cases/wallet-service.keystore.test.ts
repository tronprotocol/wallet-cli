import { describe, it, expect, beforeEach, vi } from "vitest";

// Cheap KDF for keystore encryption in this suite — see cheap-scrypt.ts. Production untouched, and
// the real KDF is covered by domain/keystore/keystore-v3.test.ts.
vi.mock(
  "@noble/hashes/scrypt.js",
  async () => import("../../adapters/outbound/persistence/crypto/__test-support__/cheap-scrypt.js"),
);
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Keystore } from "../../adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../../adapters/outbound/persistence/fs/index.js";
import type { BackupRecord } from "../ports/backup-records.js";
import type { BackupFormat } from "../ports/backup-writer.js";
import { Derivation } from "../../domain/derivation/index.js";
import type { WalletsFile } from "../../domain/types/index.js";
import { KeystoreV3 } from "../../domain/keystore/index.js";
import { tronHexAddress } from "../../domain/address/index.js";
import { derivePrivAddresses } from "../../domain/wallet/index.js";
import { WalletService } from "./wallet-service.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const PW = "masterpw123A";
const RAW_KEY = "4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
const NOW = Date.UTC(2026, 7, 5, 11, 40, 30, 123); // ms are dropped from the record's timestamp

/** captures what the writer was handed instead of touching the disk. */
function fakeWriter() {
  const writes: Array<{
    accountId: string;
    requested?: string;
    payload: unknown;
    format?: BackupFormat;
  }> = [];
  return {
    writes,
    write(
      accountId: string,
      requested: string | undefined,
      payload: unknown,
      format?: BackupFormat,
    ) {
      writes.push({ accountId, requested, payload, format });
      return {
        out: requested ?? `./${accountId}-${writes.length}.json`,
        fileMode: "0600" as const,
        bytes: 42,
      };
    },
  };
}

function fakeRecords(seed: BackupRecord[] = []) {
  const records = [...seed];
  return {
    records,
    append(r: BackupRecord) {
      records.unshift(r);
    },
    list() {
      return [...records];
    },
  };
}

function harness() {
  const root = mkdtempSync(join(tmpdir(), "wsk-"));
  const keystore = new Keystore(root, new AtomicFileStore(), () => PW);
  const writer = fakeWriter();
  const store = fakeRecords();
  const service = new WalletService(keystore, {} as any, writer, store, () => NOW);
  return { root, keystore, writer, store, service };
}

describe("WalletService.backupKeystore", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("exports an HD account's OWN derived key, not the seed", () => {
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    h.service.backupKeystore(accountId, undefined, PW, "tron");

    const expected = Derivation.derive(
      Derivation.mnemonicToSeed(MNEMONIC),
      Derivation.path("tron", 0),
    ).privateKey;
    const file = h.writer.writes[0]!.payload;
    expect(bytesToHex(KeystoreV3.decrypt(file, PW))).toBe(bytesToHex(expected));
  });

  it("exports the key of the requested HD index, not always index 0", () => {
    const { accountId: root } = h.keystore.import({
      secret: MNEMONIC,
      type: "seed",
      label: "main",
    });
    const walletId = root.split(".")[0]!;
    const { accountId } = h.keystore.addAccount(walletId, 3);

    h.service.backupKeystore(accountId, undefined, PW, "tron");
    const expected = Derivation.derive(
      Derivation.mnemonicToSeed(MNEMONIC),
      Derivation.path("tron", 3),
    ).privateKey;
    expect(bytesToHex(KeystoreV3.decrypt(h.writer.writes[0]!.payload, PW))).toBe(
      bytesToHex(expected),
    );
  });

  it("exports a privateKey wallet's stored key and records the account's TRON address", () => {
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey", label: "hot" });
    const result = h.service.backupKeystore(accountId, undefined, PW, "tron");

    const file = h.writer.writes[0]!.payload as { address: string };
    expect(bytesToHex(KeystoreV3.decrypt(file, PW))).toBe(RAW_KEY);
    expect(file.address).toBe(tronHexAddress(result.addresses.tron!));
    expect(file.address).toMatch(/^41[0-9a-f]{40}$/);
  });

  it("encrypts with the master password it was given, not with a fixed one", () => {
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey" });
    h.service.backupKeystore(accountId, undefined, "a-different-password", "tron");
    expect(() => KeystoreV3.decrypt(h.writer.writes[0]!.payload, PW)).toThrowError(
      /incorrect keystore file password/,
    );
  });

  it("asks the writer for the keystore filename shape and reports format: keystore", () => {
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey" });
    const result = h.service.backupKeystore(accountId, undefined, PW, "tron");
    expect(h.writer.writes[0]!.format).toBe("keystore");
    expect(result).toMatchObject({
      format: "keystore",
      secretType: "privateKey",
      fileMode: "0600",
    });
  });

  it("refuses a watch-only account, which has no key to export", () => {
    const { accountId } = h.keystore.registerWatch({
      family: "tron",
      address: "TQ5NMqJjCu5zSvSHSsuMEwjZ8pmpBRhkHm",
    });
    expect(() => h.service.backupKeystore(accountId, undefined, PW, "tron")).toThrowError(
      /hold no exportable secret/,
    );
  });
});

describe("WalletService derivation-path disclosure", () => {
  it("withholds derivationPath from list/current/use/rename as a command-level policy", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const seedId = accountId.split(".")[0]!;
    h.keystore.addAccount(seedId, 1);

    expect(h.service.list().every((account) => account.derivationPath === null)).toBe(true);
    expect(h.service.current(accountId).derivationPath).toBeNull();
    expect(h.service.use(`${seedId}.1`).derivationPath).toBeNull();
    expect(h.service.rename(`${seedId}.1`, "renamed").derivationPath).toBeNull();
  });

  it("reports both verified paths from derive", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const result = h.service.derive({ seedId: accountId.split(".")[0]!, index: 1 });

    expect(result.derivationPath).toEqual({
      tron: "m/44'/195'/0'/0/1",
      evm: "m/44'/60'/0'/0/1",
    });
  });
});

describe("WalletService derive selection", () => {
  it("uses the active HD account and keeps working after a derived child becomes active", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });

    expect(h.service.derive({}).accountId).toBe(`${accountId.split(".")[0]}.1`);
    expect(h.service.derive({}).accountId).toBe(`${accountId.split(".")[0]}.2`);
  });

  it("accepts any HD child through --account", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const seedId = accountId.split(".")[0]!;
    h.keystore.addAccount(seedId, 1);

    expect(h.service.derive({ account: `${seedId}.1`, index: 2 }).accountId).toBe(`${seedId}.2`);
  });

  it("gives --seed-id precedence without resolving --account", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const seedId = accountId.split(".")[0]!;

    expect(
      h.service.derive({ seedId, account: "account-that-does-not-exist", index: 1 }).accountId,
    ).toBe(`${seedId}.1`);
  });

  it("rejects a selected non-HD account with actionable guidance", () => {
    const h = harness();
    const { accountId } = h.keystore.import({
      secret: RAW_KEY,
      type: "privateKey",
      label: "hot",
    });

    expect(() => h.service.derive({ account: accountId })).toThrowError(
      /account is not HD; select an account belonging to an HD wallet or pass --seed-id/,
    );
  });

  it("does not tell an invalid --seed-id caller to pass the same flag again", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey" });

    expect(() => h.service.derive({ seedId: accountId })).toThrowError(
      /wallet is not HD; --seed-id must name an HD seed wallet/,
    );
  });

  it("warns only when reselecting an existing legacy slot", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const seedId = accountId.split(".")[0]!;
    const warnings: string[] = [];

    h.service.derive({ seedId, index: 1 }, (message) => warnings.push(message));
    h.service.derive({ seedId, index: 1 }, (message) => warnings.push(message));
    expect(warnings).toEqual([]); // created-current and existing-current both need no warning

    const store = new AtomicFileStore();
    const path = join(h.root, "wallets.json");
    const file = store.readJson<WalletsFile>(path)!;
    const source = file.wallets[0]!.source as Extract<
      WalletsFile["wallets"][0]["source"],
      { type: "seed" }
    >;
    source.addresses["1"]!.tron = "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ";
    store.writeJsonAll([{ path, value: file }]);

    h.service.derive({ seedId, index: 1 }, (message) => warnings.push(message));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("legacy TRON path m/44'/195'/1'/0/0");
    expect(warnings[0]).toContain("recovery phrase can still derive this key");
    expect(warnings[0]).toContain("default mnemonic recovery will not recreate");
  });
});

describe("WalletService export audit log", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("records a native backup under its command form, with the file it went to", () => {
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const result = h.service.backup(accountId, "./main-backup.json");

    expect(h.store.list()).toEqual([
      {
        operation: "backup",
        accountId,
        account: result.addresses.tron,
        label: "main",
        out: "./main-backup.json",
        timestamp: "2026-08-05T11:40:30Z",
      },
    ]);
  });

  it("distinguishes a keystore export from a native one", () => {
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey", label: "hot" });
    h.service.backupKeystore(accountId, "./hot.keystore.json", PW, "tron");
    expect(h.store.list()[0]).toMatchObject({
      operation: "backup --keystore",
      out: "./hot.keystore.json",
    });
  });

  it("does not record an export whose file was never written", () => {
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey" });
    const failing = new WalletService(
      h.keystore,
      {} as any,
      {
        write: () => {
          throw new Error("disk full");
        },
      },
      h.store,
      () => NOW,
    );
    expect(() => failing.backupKeystore(accountId, undefined, PW, "tron")).toThrowError();
    expect(h.store.list()).toEqual([]);
  });

  it("does not record an import — the log tracks material leaving, not arriving", () => {
    const file = KeystoreV3.encrypt(Buffer.from(RAW_KEY, "hex"), "file-pw", "41" + "00".repeat(20));
    h.service.importKeystore(file, "file-pw");
    expect(h.store.list()).toEqual([]);
  });
});

describe("WalletService.backupRecords", () => {
  const record = (over: Partial<BackupRecord>): BackupRecord => ({
    operation: "backup",
    accountId: "wlt_a.0",
    account: "TAAA",
    label: "main",
    out: "./a.json",
    timestamp: "2026-08-05T11:40:00Z",
    ...over,
  });

  function withRecords(seed: BackupRecord[]) {
    const keystore = new Keystore(
      mkdtempSync(join(tmpdir(), "wsr-")),
      new AtomicFileStore(),
      () => PW,
    );
    const store = fakeRecords(seed);
    return {
      keystore,
      service: new WalletService(keystore, {} as any, fakeWriter(), store, () => NOW),
    };
  }

  it("reports an empty log without failing", () => {
    expect(withRecords([]).service.backupRecords()).toEqual({
      records: [],
      pagination: { offset: 0, limit: null, total: 0 },
    });
  });

  it("returns every record and a null limit when no limit is asked for", () => {
    const seed = [record({ out: "./1.json" }), record({ out: "./2.json" })];
    const { records, pagination } = withRecords(seed).service.backupRecords();
    expect(records).toEqual(seed);
    expect(pagination).toEqual({ offset: 0, limit: null, total: 2 });
  });

  it("windows with offset/limit while reporting the unwindowed total", () => {
    const seed = [1, 2, 3, 4, 5].map((n) => record({ out: `./${n}.json` }));
    const { records, pagination } = withRecords(seed).service.backupRecords({
      offset: 1,
      limit: 2,
    });
    expect(records.map((r) => r.out)).toEqual(["./2.json", "./3.json"]);
    expect(pagination).toEqual({ offset: 1, limit: 2, total: 5 });
  });

  it("treats --from and --to as INCLUSIVE bounds", () => {
    const seed = [
      record({ timestamp: "2026-08-06T00:00:00Z", out: "./late.json" }),
      record({ timestamp: "2026-08-05T00:00:00Z", out: "./mid.json" }),
      record({ timestamp: "2026-08-04T00:00:00Z", out: "./early.json" }),
    ];
    const { records } = withRecords(seed).service.backupRecords({
      from: "2026-08-05T00:00:00Z",
      to: "2026-08-06T00:00:00Z",
    });
    expect(records.map((r) => r.out)).toEqual(["./late.json", "./mid.json"]);
  });

  it("filters by account, matching a since-renamed account on its recorded accountId", () => {
    const h = withRecords([]);
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey", label: "hot" });
    const address = h.keystore.describe(accountId).addresses.tron!;
    h.service.backup(accountId, "./hot.json");
    h.service.backupRecords(); // no-op, keeps the log as written
    h.keystore.rename(accountId, "renamed");

    // logged under the OLD label; resolvable by the new one, by id, and by address.
    for (const ref of ["renamed", accountId, address]) {
      expect(h.service.backupRecords({ account: ref }).records.map((r) => r.label)).toEqual([
        "hot",
      ]);
    }
  });

  it("excludes other accounts' exports when filtering", () => {
    const h = withRecords([
      record({ accountId: "wlt_other.0", account: "TOTHER", label: "other" }),
    ]);
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey", label: "hot" });
    h.service.backup(accountId, "./hot.json");
    expect(h.service.backupRecords({ account: accountId }).records.map((r) => r.out)).toEqual([
      "./hot.json",
    ]);
  });
});

describe("WalletService.importKeystore", () => {
  let h: ReturnType<typeof harness>;
  const v3 = (keyHex = RAW_KEY, password = "file-pw") =>
    KeystoreV3.encrypt(Buffer.from(keyHex, "hex"), password, "41" + "00".repeat(20));
  beforeEach(() => {
    h = harness();
  });

  it("imports the file's key as a privateKey account and makes it active", () => {
    const result = h.service.importKeystore(v3(), "file-pw", "imported");
    expect(result).toMatchObject({
      status: "created",
      label: "imported",
      type: "privateKey",
      index: null,
      active: true,
    });
    expect(
      bytesToHex(
        h.keystore.decryptKey(
          (h.keystore.resolveAccount(result.accountId).wallet.source as any).keyId,
        ),
      ),
    ).toBe(RAW_KEY);
  });

  it("re-encrypts under the MASTER password, so the file's password is not needed again", () => {
    const result = h.service.importKeystore(v3(RAW_KEY, "totally-different"), "totally-different");
    // decryptKey uses the keystore's master password getter; it succeeding is the assertion.
    expect(
      bytesToHex(
        h.keystore.decryptKey(
          (h.keystore.resolveAccount(result.accountId).wallet.source as any).keyId,
        ),
      ),
    ).toBe(RAW_KEY);
  });

  it("rejects a wrong file password without creating an account", () => {
    expect(() => h.service.importKeystore(v3(), "wrong-pw")).toThrowError(
      /incorrect keystore file password/,
    );
    expect(h.keystore.list()).toEqual([]);
  });

  it("is idempotent against an existing privateKey account holding the same key (matches import private-key)", () => {
    const { accountId } = h.keystore.import({
      secret: RAW_KEY,
      type: "privateKey",
      label: "already-here",
    });
    const result = h.service.importKeystore(v3(), "file-pw");
    expect(result).toMatchObject({ accountId, status: "existing" });
    expect(h.keystore.list()).toHaveLength(1);
  });

  it("creates a second account when the key belongs to an existing HD account's derived address", () => {
    const { accountId: seedAccountId } = h.keystore.import({
      secret: MNEMONIC,
      type: "seed",
      label: "main",
    });
    const hdKey = Derivation.derive(
      Derivation.mnemonicToSeed(MNEMONIC),
      Derivation.path("tron", 0),
    ).privateKey;
    expect(h.keystore.describe(seedAccountId).type).toBe("seed");
    const result = h.service.importKeystore(v3(bytesToHex(hdKey), "file-pw"), "file-pw");
    expect(result.status).toBe("created");
    expect(result.type).toBe("privateKey");
    expect(h.keystore.list()).toHaveLength(2);
  });

  it("rejects an out-of-range private key as invalid_private_key, not internal_error", () => {
    // 32 zero bytes: well-formed as a V3 keystore payload (right shape, right length), but not a
    // valid secp256k1 scalar — derivePrivAddresses() would otherwise throw a raw RangeError that
    // classifyError redacts to internal_error, hiding the actionable cause.
    const zeroKey = "00".repeat(32);
    let err: any;
    try {
      h.service.importKeystore(v3(zeroKey, "file-pw"), "file-pw");
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe("invalid_private_key");
    expect(h.keystore.list()).toEqual([]);
  });

  it("does not refuse a same-address WATCH account — it holds no secret an import could destroy", () => {
    const watchAddress = derivePrivAddresses(Buffer.from(RAW_KEY, "hex")).tron!;
    h.keystore.registerWatch({ family: "tron", address: watchAddress });
    const result = h.service.importKeystore(v3(), "file-pw", "now-imported");
    expect(result.status).toBe("created");
    expect(h.keystore.list()).toHaveLength(2);
  });
});

/**
 * A backup is two side effects in order: the secret file is committed, then the export is recorded.
 * If the second throws — a lock held, a set-aside rename that fails, any local IO fault — the first
 * has already happened. The command reported a plain failure, so the caller learned neither that a
 * secret had been written nor where it went. Without `--out` that is a timestamped file in the
 * process's working directory, so "somewhere in whichever directory the agent happened to be in".
 * Retrying then writes a second copy.
 *
 * The export genuinely did not fully succeed, so it stays a failure — but the path it produced is
 * part of the error, because the caller has to be able to find and shred it.
 */
describe("WalletService reports the file it wrote when the audit append fails", () => {
  const auditFails = (h: ReturnType<typeof harness>) =>
    new WalletService(
      h.keystore,
      {} as any,
      { write: () => ({ out: "/tmp/exported-secret.json", fileMode: "0600" as const, bytes: 42 }) },
      {
        append: () => {
          throw new Error("audit log is unwritable");
        },
        list: () => [],
      },
      () => NOW,
    );

  it.each([
    ["native backup", (s: WalletService, id: string) => s.backup(id, undefined)],
    [
      "keystore backup",
      (s: WalletService, id: string) => s.backupKeystore(id, undefined, PW, "tron"),
    ],
  ])("%s still fails, but names the file it already committed", (_label, run) => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey" });

    try {
      run(auditFails(h), accountId);
      throw new Error("expected the export to fail");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("audit_append_failed");
      expect((error as { details?: { out?: string } }).details?.out).toBe(
        "/tmp/exported-secret.json",
      );
    }
  });
});

// The problem, restated: a seed account holds a DIFFERENT private key per family (derivation
// puts TRON at coin 195 and EVM at coin 60). A V3 keystore holds exactly one key, so "export my
// private key" has two answers and the wallet must be told which.
describe("keystore export follows the selected network's family", () => {
  const MNEMONIC = "test test test test test test test test test test test junk";
  const seed = Derivation.mnemonicToSeed(MNEMONIC);

  function exported(family: "tron" | "evm") {
    const h = harness();
    h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    h.service.backupKeystore("main", undefined, PW, family);
    return h.writer.writes.at(-1)!.payload as { address: string };
  }

  it.each([
    ["tron", "m/44'/195'/0'/0/0"],
    ["evm", "m/44'/60'/0'/0/0"],
  ])("encrypts the %s key, derived at %s", (family, path) => {
    const file = exported(family as "tron" | "evm");
    const expected = Derivation.derive(seed, path).privateKey;

    expect(bytesToHex(KeystoreV3.decrypt(file, PW))).toBe(bytesToHex(expected));
  });

  // The two keys are genuinely different, so exporting the wrong one hands the user an address
  // their wallet has never shown them.
  it("exports two different keys for the two families", () => {
    expect(KeystoreV3.decrypt(exported("tron"), PW)).not.toEqual(
      KeystoreV3.decrypt(exported("evm"), PW),
    );
  });

  // `address` is informational — every reader derives the real address from the key it decrypts
  // (our own importer ignores it) — but writing the wrong family's encoding is still misleading.
  it("writes the address in the exported family's own encoding", () => {
    expect(exported("tron").address).toMatch(/^41[0-9a-f]{40}$/);
    expect(exported("evm").address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

/**
 * The audit log answers "which key left this machine". A seed account holds a different key per
 * family, so filing an EVM export under the account's TRON address names the wrong key —
 * and the log's only job is to name the right one.
 */
describe("WalletService.backupKeystore — what the audit log records", () => {
  it("files a keystore export under the exported family's address", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const account = h.keystore.describe(accountId);

    h.service.backupKeystore(accountId, undefined, PW, "evm");
    h.service.backupKeystore(accountId, undefined, PW, "tron");

    const [tron, evm] = h.store.list(); // newest first
    expect(evm).toMatchObject({ family: "evm", account: account.addresses.evm });
    expect(tron).toMatchObject({ family: "tron", account: account.addresses.tron });
    expect(evm!.account).not.toBe(tron!.account);
  });

  // A mnemonic is every family's key at once, so naming one would claim less than what left.
  it("records no family for a native backup", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });

    h.service.backup(accountId, undefined);

    expect(h.store.list()[0]).not.toHaveProperty("family");
  });

  // Filtering used to compare the TRON address alone, which hid an account's own EVM exports.
  it("finds an EVM export when filtering by that account", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    h.service.backupKeystore(accountId, undefined, PW, "evm");

    const { records } = h.service.backupRecords({ account: accountId });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ family: "evm" });
  });
});

describe("backup --keystore rescues an account on the old TRON path", () => {
  const TRON_LEGACY_1 = "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ"; // m/44'/195'/1'/0/0
  const TRON_INDEX_0 = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";

  /** harness() plus a hand-written pre-correction account 1 — the shape no API can produce any
   *  more, because addAccount derives the corrected path and (Task 5) refuses this wallet. */
  function legacyHarness() {
    const h = harness();
    h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const store = new AtomicFileStore();
    const path = join(h.root, "wallets.json");
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
    return { ...h, seedId: h.keystore.list()[0]!.seedId! };
  }

  // This is the ONE place the binary may use a template it no longer produces, and its only
  // purpose is to let the key leave. Exporting the current template's key would hand the user an
  // empty address — while the refusal message told them to run exactly this command.
  it("exports the key that owns the stored address, not the current template's", () => {
    const h = legacyHarness();

    const result = h.service.backupKeystore(`${h.seedId}.1`, undefined, PW, "tron");

    const file = h.writer.writes[0]!.payload as { address: string };
    expect(file.address).toBe(tronHexAddress(TRON_LEGACY_1));
    expect(result.derivationPath).toEqual({
      tron: "m/44'/195'/1'/0/0",
      evm: "m/44'/60'/0'/0/1",
    });
  });

  it("still exports the current template's key for an unaffected account", () => {
    const h = legacyHarness();

    h.service.backupKeystore(`${h.seedId}.0`, undefined, PW, "tron");

    const file = h.writer.writes[0]!.payload as { address: string };
    expect(file.address).toBe(tronHexAddress(TRON_INDEX_0));
  });
});

describe("native backup warns about accounts the default recovery flow will not recreate", () => {
  const TRON_LEGACY_1 = "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ"; // m/44'/195'/1'/0/0

  function legacyHarness() {
    const h = harness();
    h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const store = new AtomicFileStore();
    const path = join(h.root, "wallets.json");
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
    return { ...h, seedId: h.keystore.list()[0]!.seedId! };
  }

  it("names the account and path without claiming the phrase cannot derive its key", () => {
    const h = legacyHarness();
    const warnings: string[] = [];

    h.service.backup(`${h.seedId}.0`, undefined, (m) => warnings.push(m));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`${h.seedId}.1`);
    expect(warnings[0]).toContain("m/44'/195'/1'/0/0");
    expect(warnings[0]).toContain("default mnemonic recovery will NOT recreate");
    expect(warnings[0]).toContain("recovery phrase can still derive that key");
    expect(warnings[0]).not.toContain("recovery phrase does NOT back up");
    expect(warnings[0]).toMatch(/--keystore/);
  });

  // The warning is about the WALLET, not the account named on the command line: one mnemonic
  // backs up every account of its seed, so backing up index 1 leaves the same gap.
  it("warns no matter which account of the wallet was named", () => {
    const h = legacyHarness();
    const warnings: string[] = [];

    h.service.backup(`${h.seedId}.1`, undefined, (m) => warnings.push(m));

    expect(warnings).toHaveLength(1);
  });

  it("stays quiet for a wallet whose accounts are all on the current template", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    h.keystore.addAccount(accountId.split(".")[0]!, 1);
    const warnings: string[] = [];

    h.service.backup(accountId, undefined, (m) => warnings.push(m));

    expect(warnings).toEqual([]);
  });

  it("stays quiet for a private-key account, which has no derivation at all", () => {
    const h = harness();
    const { accountId } = h.keystore.import({ secret: RAW_KEY, type: "privateKey" });
    const warnings: string[] = [];

    h.service.backup(accountId, undefined, (m) => warnings.push(m));

    expect(warnings).toEqual([]);
  });
});
