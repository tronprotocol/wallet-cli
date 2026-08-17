import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
    const seeded = Array.from({ length: BACKUP_RECORD_LIMIT }, (_v, i) =>
      record(BACKUP_RECORD_LIMIT - i),
    );
    writeFileSync(
      join(root, "backup-records.json"),
      JSON.stringify({ version: 1, records: seeded }),
    );

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

  /**
   * The audit log is the only local record of which secrets left this machine, and an append is a
   * whole-file rewrite. A file that is legal json but not a shape we recognise used to read as
   * "no records", so the next export overwrote it — reliably and silently destroying the evidence.
   * A future `version: 2` written by a newer build and then opened by this one would do exactly
   * that, which makes it a forward-compatibility trap as much as a tampering one.
   *
   * Unrecognised content is therefore set aside under a `.unreadable-<n>` name before anything is
   * written. Backup keeps working — refusing to export because the log is unreadable helps nobody —
   * but the original bytes survive for whoever has to reconstruct what happened.
   */
  const unreadable = [
    ["a newer schema version", { version: 2, entries: [{ account: "T1" }] }],
    ["records that are not an array", { version: 1, records: { a: 1 } }],
    ["no records key at all", { version: 1 }],
  ] as const;

  it.each(unreadable)("sets aside %s instead of reporting an empty log", (_label, content) => {
    writeFileSync(join(root, "backup-records.json"), JSON.stringify(content));

    expect(store.list()).toEqual([]);

    const quarantined = readdirSync(root).filter((f) =>
      f.startsWith("backup-records.json.unreadable"),
    );
    expect(quarantined).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(root, quarantined[0]!), "utf8"))).toEqual(content);
  });

  it("keeps the set-aside copy when the next export rewrites the log", () => {
    const original = { version: 2, entries: [{ account: "T1" }] };
    writeFileSync(join(root, "backup-records.json"), JSON.stringify(original));

    store.append(record(1));

    expect(store.list()).toEqual([record(1)]);
    const quarantined = readdirSync(root).filter((f) =>
      f.startsWith("backup-records.json.unreadable"),
    );
    expect(JSON.parse(readFileSync(join(root, quarantined[0]!), "utf8"))).toEqual(original);
  });

  // Syntactically broken json already failed closed; that behaviour is the reference, not the bug.
  it("still refuses to touch a file that is not json at all", () => {
    writeFileSync(join(root, "backup-records.json"), '{"version":1,"records":[');
    expect(() => store.list()).toThrowError();
    expect(readFileSync(join(root, "backup-records.json"), "utf8")).toBe(
      '{"version":1,"records":[',
    );
  });
});
