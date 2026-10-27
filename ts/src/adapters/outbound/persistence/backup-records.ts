import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { BackupRecord, BackupRecordStore } from "../../../application/ports/backup-records.js";
import { AtomicFileStore } from "./fs/index.js";

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
    // Lock the read-modify-write so concurrent backups cannot lose records.
    this.store.withLock(this.path, () => {
      const records = [record, ...this.#read()].slice(0, BACKUP_RECORD_LIMIT);
      this.store.writeJson(this.path, { version: 1, records } satisfies BackupRecordsFile);
    });
  }

  list(): BackupRecord[] {
    return this.#read();
  }

  // Set aside unknown schemas before rewriting; malformed JSON throws without changing the file.
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
