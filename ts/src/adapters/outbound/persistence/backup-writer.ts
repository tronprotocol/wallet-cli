import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { UsageError } from "../../../domain/errors/index.js";
import type {
  BackupWriter,
  BackupWriteResult,
} from "../../../application/ports/backup-writer.js";

export class SecureBackupWriter implements BackupWriter {
  constructor(
    private readonly root: string,
    private readonly now: () => number = Date.now,
  ) {}

  write(accountId: string, requestedPath: string | undefined, payload: unknown): BackupWriteResult {
    const path = requestedPath
      ? resolve(requestedPath)
      : join(this.root, "backups", `${accountId}-${this.now()}.json`);
    if (existsSync(path)) {
      throw new UsageError("output_exists", `refusing to overwrite existing file: ${path}`);
    }
    mkdirSync(dirname(path), { recursive: true });
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    writeFileSync(path, content, { mode: 0o600 });
    return { out: path, fileMode: "0600", bytes: Buffer.byteLength(content) };
  }
}
