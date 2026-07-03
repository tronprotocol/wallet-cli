/**
 * AtomicFileStore — atomic JSON read/write plus advisory lock.
 * Writes go to a temp file then rename into place; concurrent processes coordinate
 * via an O_EXCL lockfile so they don't clobber each other (wallets.json/config.yaml).
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { ExecutionError } from "../../../../domain/errors/index.js";

function sleepMs(ms: number): void {
  // synchronous sleep without busy-spin
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** A lock is stale if its owner PID is dead, or (owner unknown) it is older than staleMs. */
function isStaleLock(lock: string, staleMs: number): boolean {
  let st;
  try {
    st = statSync(lock);
  } catch {
    return false; // vanished — let the next openSync attempt resolve it
  }
  const pid = parseInt(readFileSync(lock, "utf8").trim(), 10);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0); // throws ESRCH if the process is gone
      return false; // owner alive → never steal, regardless of age
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ESRCH";
    }
  }
  return Date.now() - st.mtimeMs > staleMs; // no readable owner → fall back to age
}

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
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${this.#counter++}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, path); // atomic replace on same filesystem
  }

  writeText(path: string, text: string): void {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${this.#counter++}.tmp`;
    writeFileSync(tmp, text, { mode: 0o600 });
    renameSync(tmp, path);
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
          try { unlinkSync(lock); } catch { /* someone else won the steal */ }
          continue;
        }
        if (Date.now() > deadline) {
          throw new ExecutionError("execution_error", `timed out acquiring lock ${lock}`);
        }
        sleepMs(25);
      }
    }
    try {
      writeSync(fd, `${process.pid}\n`); // record owner so others can detect a dead holder
      return fn();
    } finally {
      closeSync(fd);
      try {
        unlinkSync(lock);
      } catch {
        /* best-effort */
      }
    }
  }

  #counter = 0;
}
