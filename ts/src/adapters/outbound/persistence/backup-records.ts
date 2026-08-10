/**
 * FileBackupRecordStore — the export audit log as a single JSON file under the wallet root.
 *
 * Newest-first on disk so a read needs no sort and a truncation is a plain `slice`. Retention is a
 * hard-coded 1000 entries: it is an audit trail, not a database, and making it configurable would
 * invite setting it to 0 — i.e. silently turning the trail off.
 */
import { join } from "node:path";
import type { BackupRecord, BackupRecordStore } from "../../../application/ports/backup-records.js";
import { AtomicFileStore } from "./fs/index.js";

/** Kept deliberately non-configurable — see the note above. */
export const BACKUP_RECORD_LIMIT = 1000;

interface BackupRecordsFile {
  version: 1;
  records: BackupRecord[];
}

export class FileBackupRecordStore implements BackupRecordStore {
  private readonly path: string;

  constructor(
    root: string,
    private readonly store: AtomicFileStore,
  ) {
    this.path = join(root, "backup-records.json");
  }

  append(record: BackupRecord): void {
    // Locked read-modify-write: two concurrent backups must not drop each other's entry.
    this.store.withLock(this.path, () => {
      const records = [record, ...this.#read()].slice(0, BACKUP_RECORD_LIMIT);
      this.store.writeJson(this.path, { version: 1, records } satisfies BackupRecordsFile);
    });
  }

  list(): BackupRecord[] {
    return this.#read();
  }

  #read(): BackupRecord[] {
    const file = this.store.readJson<BackupRecordsFile>(this.path);
    return Array.isArray(file?.records) ? file.records : [];
  }
}
