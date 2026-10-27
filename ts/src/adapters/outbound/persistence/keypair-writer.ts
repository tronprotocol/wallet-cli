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
import { dirname, join, resolve } from "node:path";
import { ExecutionError, UsageError } from "../../../domain/errors/index.js";
import type { KeypairTarget, KeypairWriter } from "../../../application/ports/keypair-writer.js";

// Plaintext private-key files require exclusive creation and mode 0600.
export class SecureKeypairWriter implements KeypairWriter {
  constructor(private readonly root: string) {}

  write(target: KeypairTarget, value: unknown): string {
    return this.#writeTo(
      "out" in target ? target.out : join(this.root, "generated", `keypair-${target.name}`),
      value,
    );
  }

  #writeTo(path: string, value: unknown): string {
    const target = resolve(path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    let descriptor: number | undefined;
    let created = false;
    try {
      descriptor = openSync(
        target,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      // Mark ownership only after exclusive creation succeeds.
      created = true;
      fchmodSync(descriptor, 0o600);
      writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
        throw new UsageError("output_exists", `refusing to overwrite existing file: ${target}`);
      }
      // Remove unfinished files so exclusive creation permits a retry.
      if (created) {
        try {
          unlinkSync(target);
        } catch {
          // Preserve the original write failure.
        }
      }
      throw new ExecutionError("io_error", `could not write keypair file: ${target}`);
    }
  }
}
