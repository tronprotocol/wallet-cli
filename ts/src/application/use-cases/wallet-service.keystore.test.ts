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
import { KeystoreV3 } from "../../domain/keystore/index.js";
import { tronHexAddress } from "../../domain/address/index.js";
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
  const keystore = new Keystore(
    mkdtempSync(join(tmpdir(), "wsk-")),
    new AtomicFileStore(),
    () => PW,
  );
  const writer = fakeWriter();
  const store = fakeRecords();
  const service = new WalletService(keystore, {} as any, writer, store, () => NOW);
  return { keystore, writer, store, service };
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

  it("refuses a same-address account instead of overwriting it (unlike the Java implementation)", () => {
    h.keystore.import({ secret: RAW_KEY, type: "privateKey", label: "already-here" });
    let err: any;
    try {
      h.service.importKeystore(v3(), "file-pw");
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe("account_exists");
    expect(err.message).toMatch(/already-here/);
    expect(h.keystore.list()).toHaveLength(1);
  });

  it("refuses a keystore whose key belongs to an existing HD account, protecting its seed", () => {
    const { accountId } = h.keystore.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const hdKey = Derivation.derive(
      Derivation.mnemonicToSeed(MNEMONIC),
      Derivation.path("tron", 0),
    ).privateKey;
    expect(h.keystore.describe(accountId).type).toBe("seed");
    expect(() =>
      h.service.importKeystore(v3(bytesToHex(hdKey), "file-pw"), "file-pw"),
    ).toThrowError(/already holds this address/);
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

// §3.10's problem, restated: a seed account holds a DIFFERENT private key per family (§1.2 puts
// TRON at coin 195 and EVM at coin 60). A V3 keystore holds exactly one key, so "export my
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
 * family (§1.2), so filing an EVM export under the account's TRON address names the wrong key —
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
