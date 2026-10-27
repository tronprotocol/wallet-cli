import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { ExecutionError } from "../../../../domain/errors/index.js";

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isStaleLock(lock: string, staleMs: number): boolean {
  let st;
  try {
    st = statSync(lock);
  } catch {
    return false;
  }
  const pid = parseInt(readFileSync(lock, "utf8").trim(), 10);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      return false; // Never steal a live process's lock, regardless of age.
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ESRCH";
    }
  }
  return Date.now() - st.mtimeMs > staleMs;
}

// Windows cannot open directory handles for fsync.
const DIR_FSYNC_SUPPORTED = process.platform !== "win32";

export class AtomicFileStore {
  readJson<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    if (raw.trim() === "") return null;
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      throw new ExecutionError("encoding_error", `corrupt JSON at ${path}`, { error: String(e) });
    }
  }

  writeJson(path: string, value: unknown): void {
    this.writeText(path, JSON.stringify(value, null, 2) + "\n");
  }

  // Stage all files, then commit with rollback on failure; the batch is not crash-atomic.
  writeJsonAll(entries: Array<{ path: string; value: unknown }>): void {
    const staged: Array<{ tmp: string; path: string }> = [];
    try {
      for (const { path, value } of entries) {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.${this.#counter++}.tmp`;
        staged.push({ tmp, path });
        writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
        this.fsyncFile(tmp); // Persist all staged bytes before publishing any file.
      }
    } catch (e) {
      for (const { tmp } of staged) {
        try {
          unlinkSync(tmp);
        } catch {
          // Best-effort cleanup.
        }
      }
      throwIoError(e, "could not stage atomic JSON write");
    }

    const committed: Array<{ path: string; bak: string | null }> = [];
    try {
      for (const { tmp, path } of staged) {
        // Random backup names avoid reusing recovery copies from interrupted writes.
        const bak = existsSync(path) ? `${path}.${randomBytes(16).toString("hex")}.bak` : null;
        if (bak) {
          if (existsSync(bak))
            throw new ExecutionError(
              "io_error",
              `backup path already exists, refusing to overwrite: ${bak}`,
            );
          this.commitRename(path, bak);
        }
        committed.push({ path, bak }); // Record before installation so rollback also covers a failed rename.
        this.commitRename(tmp, path);
      }
    } catch (e) {
      let restoreFailed = false;
      for (const { path, bak } of committed.reverse()) {
        try {
          if (bak)
            this.commitRename(bak, path); // Rollback replaces any installed file.
          else {
            try {
              unlinkSync(path);
            } catch {
              // Best-effort cleanup.
            }
          }
        } catch {
          restoreFailed = true;
        }
      }
      for (const { tmp } of staged) {
        try {
          unlinkSync(tmp);
        } catch {
          // Best-effort cleanup.
        }
      }
      if (restoreFailed) {
        throw new ExecutionError(
          "io_error",
          "partial keystore write; automatic rollback FAILED — manual recovery needed",
          { error: String(e), files: committed.map((c) => c.path).join(", ") },
        );
      }
      // Persist rollback renames before reporting the write failure.
      try {
        for (const dir of new Set(committed.map((c) => dirname(c.path)))) this.fsyncDir(dir);
      } catch (fsyncErr) {
        // Prior data is restored, but its durability is unconfirmed.
        throw new ExecutionError(
          "io_error",
          "keystore write failed and was rolled back, but the rollback's durability could not be confirmed; the prior state is in effect — verify and retry.",
          {
            error: String(e),
            fsyncError: String(fsyncErr),
            files: committed.map((c) => c.path).join(", "),
          },
        );
      }
      throwIoError(e, "atomic JSON write failed and was rolled back");
    }
    // Persist committed renames before reporting success.
    try {
      for (const dir of new Set(staged.map((s) => dirname(s.path)))) this.fsyncDir(dir);
    } catch (e) {
      // New data is installed; report uncertain durability and retain backups without rolling back.
      throw new ExecutionError(
        "io_error",
        "keystore write committed but durability could not be confirmed; the new state is in effect — verify and retry. Backups retained.",
        { error: String(e), files: committed.map((c) => c.path).join(", ") },
      );
    }
    for (const { bak } of committed) {
      if (bak) {
        try {
          unlinkSync(bak);
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  }

  commitRename(from: string, to: string): void {
    renameSync(from, to);
  }

  fsyncFile(path: string): void {
    const fd = openSync(path, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  rawFsyncDir(dir: string): void {
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  fsyncDir(dir: string): void {
    if (!DIR_FSYNC_SUPPORTED) return;
    try {
      this.rawFsyncDir(dir);
    } catch (e) {
      // Ignore unsupported directory fsync; propagate I/O and permission errors.
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === "EINVAL" || code === "ENOTSUP" || code === "EOPNOTSUPP" || code === "ENOSYS")
        return;
      throw e;
    }
  }

  writeText(path: string, text: string): void {
    const tmp = `${path}.${process.pid}.${this.#counter++}.tmp`;
    let published = false;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(tmp, text, { mode: 0o600 });
      this.fsyncFile(tmp);
      renameSync(tmp, path);
      published = true;
      this.fsyncDir(dirname(path));
    } catch (error) {
      if (!published) {
        try {
          unlinkSync(tmp);
        } catch {
          // Best-effort cleanup.
        }
      }
      throwIoError(
        error,
        published
          ? "atomic text write committed but durability could not be confirmed"
          : "could not complete atomic text write",
      );
    }
  }

  withLock<T>(path: string, fn: () => T, opts: { timeoutMs?: number; staleMs?: number } = {}): T {
    const lock = `${path}.lock`;
    mkdirSync(dirname(path), { recursive: true });
    const deadline = Date.now() + (opts.timeoutMs ?? 5000);
    const staleMs = opts.staleMs ?? 30000;
    let fd: number | undefined;
    while (fd === undefined) {
      try {
        fd = openSync(lock, "wx");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        if (isStaleLock(lock, staleMs)) {
          try {
            unlinkSync(lock);
          } catch {
            // Another process may have removed the stale lock.
          }
          continue;
        }
        if (Date.now() > deadline) {
          throw new ExecutionError("execution_error", `timed out acquiring lock ${lock}`);
        }
        sleepMs(25);
      }
    }
    try {
      writeSync(fd, `${process.pid}\n`); // Record the PID so dead owners can be detected.
      return fn();
    } finally {
      closeSync(fd);
      try {
        unlinkSync(lock);
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  #counter = 0;
}

function throwIoError(error: unknown, message: string): never {
  if (error instanceof ExecutionError) throw error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (typeof code === "string") {
    throw new ExecutionError("io_error", message, { code });
  }
  throw error;
}
