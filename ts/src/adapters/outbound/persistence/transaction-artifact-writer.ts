import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { ExecutionError } from "../../../domain/errors/index.js";

/** Atomic, non-secret transaction artifact writer. Published files are mode 0644. */
export class TransactionArtifactWriter {
  write(path: string, hex: string): void {
    if (!path) throw new ExecutionError("io_error", "transaction artifact path is empty");
    try {
      const current = lstatSync(path, { throwIfNoEntry: false });
      if (current?.isSymbolicLink()) {
        throw new ExecutionError("io_error", "refusing to replace a symbolic-link transaction artifact");
      }
      const dir = dirname(path);
      mkdirSync(dir, { recursive: true });
      const tmp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
      let fd: number | undefined;
      try {
        fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
        fchmodSync(fd, 0o644);
        writeFileSync(fd, `${hex}\n`, "utf8");
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        renameSync(tmp, path);
        if (process.platform !== "win32") {
          const dirFd = openSync(dir, constants.O_RDONLY);
          try {
            fsyncSync(dirFd);
          } finally {
            closeSync(dirFd);
          }
        }
      } catch (error) {
        if (fd !== undefined) closeSync(fd);
        try {
          unlinkSync(tmp);
        } catch {
          // best-effort cleanup
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ExecutionError) throw error;
      throw new ExecutionError("io_error", `could not write transaction artifact: ${(error as Error).message}`);
    }
  }
}
