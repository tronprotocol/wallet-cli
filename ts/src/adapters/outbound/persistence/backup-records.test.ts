import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicFileStore } from "./fs/index.js";
import { BACKUP_RECORD_LIMIT, FileBackupRecordStore } from "./backup-records.js";
import type { BackupRecord } from "../../../application/ports/backup-records.js";

const record = (n: number): BackupRecord => ({
  operation: n % 2 === 0 ? "backup" : "backup --keystore",
  accountId: `wlt_a.${n}`,
  account: `T${n}`,
  label: n === 0 ? null : `acct-${n}`,
  out: `./export-${n}.json`,
  timestamp: `2026-08-0${(n % 9) + 1}T00:00:00Z`,
});

describe("FileBackupRecordStore", () => {
  let root: string;
  let store: FileBackupRecordStore;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "brs-"));
    store = new FileBackupRecordStore(root, new AtomicFileStore());
  });

  it("reports no records before anything is exported", () => {
    expect(store.list()).toEqual([]);
  });

  it("returns records newest-first, regardless of their timestamps", () => {
    store.append(record(1));
    store.append(record(2));
    store.append(record(3));
    expect(store.list().map((r) => r.accountId)).toEqual(["wlt_a.3", "wlt_a.2", "wlt_a.1"]);
  });

  it("round-trips every field verbatim, including a null label", () => {
    store.append(record(0));
    expect(store.list()[0]).toEqual(record(0));
  });

  it(`keeps only the most recent ${BACKUP_RECORD_LIMIT}, dropping the oldest`, () => {
    // Seeded directly: an append is a locked, fsynced rewrite, so 1000 of them would only measure
    // disk. The retention rule is what matters, and one append past the cap exercises it.
    const seeded = Array.from({ length: BACKUP_RECORD_LIMIT }, (_v, i) => record(BACKUP_RECORD_LIMIT - i));
    writeFileSync(join(root, "backup-records.json"), JSON.stringify({ version: 1, records: seeded }));

    store.append(record(0));
    const listed = store.list();
    expect(listed).toHaveLength(BACKUP_RECORD_LIMIT);
    expect(listed[0]!.accountId).toBe("wlt_a.0"); // newest kept
    expect(listed.at(-1)!.accountId).toBe("wlt_a.2"); // the oldest (wlt_a.1) evicted
  });

  it("persists to backup-records.json under the wallet root", () => {
    store.append(record(1));
    const onDisk = JSON.parse(readFileSync(join(root, "backup-records.json"), "utf8"));
    expect(onDisk).toEqual({ version: 1, records: [record(1)] });
  });

  it("treats a file with no usable records array as empty rather than failing the command", () => {
    writeFileSync(join(root, "backup-records.json"), JSON.stringify({ version: 1 }));
    expect(store.list()).toEqual([]);
    store.append(record(1));
    expect(store.list()).toEqual([record(1)]);
  });
});
