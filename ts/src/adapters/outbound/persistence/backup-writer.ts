import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ExecutionError, UsageError } from "../../../domain/errors/index.js";
import type {
  BackupFormat,
  BackupWriter,
  BackupWriteResult,
} from "../../../application/ports/backup-writer.js";

const EXTENSION: Record<BackupFormat, string> = { native: "json", keystore: "keystore.json" };

export class SecureBackupWriter implements BackupWriter {
  constructor(private readonly now: () => number = Date.now) {}

  // Defaults to the working directory; the parent directory is not vetted.
  write(
    accountId: string,
    requestedPath: string | undefined,
    payload: unknown,
    format: BackupFormat = "native",
  ): BackupWriteResult {
    const path = resolve(requestedPath ?? `${accountId}-${this.now()}.${EXTENSION[format]}`);
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    } catch {
      throw new ExecutionError("io_error", `could not create backup directory: ${dirname(path)}`);
    }
    // Exclusive creation prevents concurrent backups from overwriting the same file.
    try {
      writeFileSync(path, content, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") {
        throw new UsageError("output_exists", `refusing to overwrite existing file: ${path}`);
      }
      // Remove a partial output after a failed write.
      try {
        unlinkSync(path);
      } catch {
        // Preserve the original write failure.
      }
      throw new ExecutionError("io_error", `could not write backup file: ${path}`);
    }
    return { out: path, fileMode: "0600", bytes: Buffer.byteLength(content) };
  }
}
