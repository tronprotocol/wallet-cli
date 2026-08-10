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

  /** Default target is the CURRENT WORKING DIRECTORY, not the wallet root: an export exists to be
   *  picked up (moved offline, imported into another wallet), so it lands where the user is standing
   *  and needs no "where is <root>?" lookup. The 0600 + never-overwrite discipline below is the only
   *  protection offered — the directory itself is not vetted (shared dir, git repo: caller's call). */
  write(
    accountId: string,
    requestedPath: string | undefined,
    payload: unknown,
    format: BackupFormat = "native",
  ): BackupWriteResult {
    const path = resolve(requestedPath ?? `${accountId}-${this.now()}.${EXTENSION[format]}`);
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      throw new ExecutionError("io_error", `could not create backup directory: ${dirname(path)}`);
    }
    // `wx` = exclusive create: atomically fail if the file exists, closing the check-then-write
    // race so two concurrent backups can never clobber the same secret-bearing file.
    try {
      writeFileSync(path, content, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") {
        throw new UsageError("output_exists", `refusing to overwrite existing file: ${path}`);
      }
      // A failed write may leave the exclusively-created final path empty or truncated. Since
      // EEXIST was handled above, any path here can only be the artifact from this attempt.
      try {
        unlinkSync(path);
      } catch {
        // Best effort: report the original write failure without leaking an OS error.
      }
      throw new ExecutionError("io_error", `could not write backup file: ${path}`);
    }
    return { out: path, fileMode: "0600", bytes: Buffer.byteLength(content) };
  }
}
