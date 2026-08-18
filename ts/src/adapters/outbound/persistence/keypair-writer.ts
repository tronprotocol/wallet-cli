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

/** Exclusive, no-follow writer for plaintext private-key artifacts. */
export class SecureKeypairWriter implements KeypairWriter {
  constructor(private readonly root: string) {}

  write(target: KeypairTarget, value: unknown): string {
    // Default location is this adapter's business — the use case only supplies the name.
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
      // O_EXCL guarantees this open is what brought the file into existence, so from here on a
      // failure leaves OUR unfinished file behind — and it is ours to remove.
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
      // Refusing an existing target is deterministic input, not a runtime fault — same code, class,
      // and exit status the backup writer uses for the identical O_EXCL conflict.
      if (code === "EEXIST" || code === "ELOOP") {
        throw new UsageError("output_exists", `refusing to overwrite existing file: ${target}`);
      }
      // Without this, a half-written file stays at the final path and O_EXCL rejects every retry
      // with output_exists — a transient disk error would become a permanent, manual-fix deadlock.
      if (created) {
        try {
          unlinkSync(target);
        } catch {
          // best effort: the write error below is the one worth reporting
        }
      }
      throw new ExecutionError("io_error", `could not write keypair file: ${target}`);
    }
  }
}
