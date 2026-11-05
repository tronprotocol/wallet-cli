import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { ExecutionError, UsageError } from "../../../domain/errors/index.js";
import type { TransactionArtifactWriter } from "../../../application/ports/transaction-artifact-writer.js";

// Transaction artifacts require exclusive creation and mode 0600; an existing path is never replaced.
export class SecureTransactionArtifactWriter implements TransactionArtifactWriter {
  write(path: string, hex: string): void {
    if (!path) throw new ExecutionError("io_error", "transaction artifact path is empty");
    const dir = dirname(path);
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (error) {
      throw new ExecutionError(
        "io_error",
        `could not write transaction artifact: ${(error as Error).message}`,
      );
    }
    let fd: number | undefined;
    let created = false;
    try {
      fd = openSync(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      // Mark ownership only after exclusive creation succeeds.
      created = true;
      fchmodSync(fd, 0o600);
      writeFileSync(fd, `${hex}\n`, "utf8");
      fsyncSync(fd);
      // A failed close must not be retried: the descriptor is released either way.
      const written = fd;
      fd = undefined;
      closeSync(written);
      if (process.platform !== "win32") {
        const dirFd = openSync(dir, constants.O_RDONLY);
        try {
          fsyncSync(dirFd);
        } finally {
          closeSync(dirFd);
        }
      }
    } catch (error) {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          // The unlink and io_error below must still run.
        }
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST" || code === "ELOOP") {
        throw new UsageError("output_exists", `refusing to overwrite existing file: ${path}`);
      }
      // Remove unfinished files so exclusive creation permits a retry.
      if (created) {
        try {
          unlinkSync(path);
        } catch {
          // Preserve the original write failure.
        }
      }
      throw new ExecutionError(
        "io_error",
        `could not write transaction artifact: ${(error as Error).message}`,
      );
    }
  }
}
