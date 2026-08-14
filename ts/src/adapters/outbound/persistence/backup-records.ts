/**
 * FileBackupRecordStore — the export audit log as a single JSON file under the wallet root.
 *
 * Newest-first on disk so a read needs no sort and a truncation is a plain `slice`. Retention is a
 * hard-coded 1000 entries: it is an audit trail, not a database, and making it configurable would
 * invite setting it to 0 — i.e. silently turning the trail off.
 */
import { existsSync, renameSync } from "node:fs";
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

  /**
   * Records currently on file, or none — but never by discarding something we simply did not
   * recognise. `append` rewrites the whole file, so treating an unfamiliar shape as "empty" made
   * the next export destroy it. A newer build writing `version: 2` and this one opening it would
   * hit exactly that, which makes it a forward-compatibility trap as much as a tampering one.
   *
   * Unreadable content is moved aside instead. Refusing to export because the log is unreadable
   * would help nobody, so the export proceeds — but the original bytes survive for whoever has to
   * reconstruct what happened. (Syntactically broken json throws out of `readJson` before this,
   * and is left untouched.)
   */
  #read(): BackupRecord[] {
    const file = this.store.readJson<BackupRecordsFile>(this.path);
    if (file === null) return [];
    if (file.version === 1 && Array.isArray(file.records)) return file.records;
    this.#setAside();
    return [];
  }

  #setAside(): void {
    for (let n = 1; ; n += 1) {
      const target = `${this.path}.unreadable-${n}`;
      if (existsSync(target)) continue;
      renameSync(this.path, target);
      return;
    }
  }
}
