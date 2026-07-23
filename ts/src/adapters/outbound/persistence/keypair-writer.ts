import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { ExecutionError } from "../../../domain/errors/index.js";
import type { KeypairWriter } from "../../../application/ports/keypair-writer.js";

/** Exclusive, no-follow writer for plaintext private-key artifacts. */
export class SecureKeypairWriter implements KeypairWriter {
  write(path: string, value: unknown): string {
    const target = resolve(path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        target,
        constants.O_WRONLY
          | constants.O_CREAT
          | constants.O_EXCL
          | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      fchmodSync(descriptor, 0o600);
      writeFileSync(
        descriptor,
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8",
      );
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      if (process.platform !== "win32") {
        const parent = openSync(dirname(target), constants.O_RDONLY);
        try {
          fsyncSync(parent);
        } finally {
          closeSync(parent);
        }
      }
      return target;
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST" || code === "ELOOP") {
        throw new ExecutionError(
          "file_exists",
          `refusing to overwrite keypair file: ${target}`,
        );
      }
      throw new ExecutionError(
        "io_error",
        `could not write keypair file: ${target}`,
      );
    }
  }
}
