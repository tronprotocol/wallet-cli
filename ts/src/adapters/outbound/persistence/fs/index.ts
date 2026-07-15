/**
 * AtomicFileStore — atomic JSON read/write plus advisory lock.
 * Writes go to a temp file then rename into place; concurrent processes coordinate
 * via an O_EXCL lockfile so they don't clobber each other (wallets.json/config.yaml).
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
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
    this.fsyncFile(tmp); // durably land the content before the rename that publishes it
    renameSync(tmp, path); // atomic replace on same filesystem
    this.fsyncDir(dirname(path)); // durably land the rename (the directory entry)
  }

  /** transactional multi-file write: stage every temp first, then commit each into place while
   *  backing up the prior blob. A failure while staging unlinks the temps and leaves every target
   *  untouched. A failure mid-commit restores every already-committed target from its backup, so
   *  callers are never left with a half-migrated set; if that automatic restore itself fails, an
   *  ExecutionError("io_error") is thrown and the backups are left on disk for manual recovery. */
  writeJsonAll(entries: Array<{ path: string; value: unknown }>): void {
    const staged: Array<{ tmp: string; path: string }> = [];
    try {
      for (const { path, value } of entries) {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.${this.#counter++}.tmp`;
        staged.push({ tmp, path });
        writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
        this.fsyncFile(tmp); // land every staged blob before any commit rename runs
      }
    } catch (e) {
      for (const { tmp } of staged) { try { unlinkSync(tmp); } catch { /* best-effort */ } }
      throw e;
    }

    // commit phase: back up each existing target, then move its temp into place.
    const committed: Array<{ path: string; bak: string | null }> = [];
    try {
      for (const { tmp, path } of staged) {
        // high-entropy backup name: a 128-bit random suffix can't collide with a leftover .bak
        // from a prior crashed run, so the commit never overwrites an existing recovery copy.
        const bak = existsSync(path) ? `${path}.${randomBytes(16).toString("hex")}.bak` : null;
        if (bak) {
          if (existsSync(bak)) throw new ExecutionError("io_error", `backup path already exists, refusing to overwrite: ${bak}`);
          this.commitRename(path, bak); // set aside the old blob
        }
        committed.push({ path, bak }); // record BEFORE the tmp rename so restore covers this file
        this.commitRename(tmp, path); // install the new blob
      }
    } catch (e) {
      let restoreFailed = false;
      for (const { path, bak } of committed.reverse()) {
        try {
          if (bak) this.commitRename(bak, path); // put the old blob back (replaces new if present)
          else { try { unlinkSync(path); } catch { /* ignore */ } } // was a newly created file
        } catch { restoreFailed = true; }
      }
      for (const { tmp } of staged) { try { unlinkSync(tmp); } catch { /* best-effort */ } }
      if (restoreFailed) {
        throw new ExecutionError(
          "io_error",
          "partial keystore write; automatic rollback FAILED — manual recovery needed",
          { error: String(e), files: committed.map((c) => c.path).join(", ") },
        );
      }
      throw e; // clean rollback: every target restored to its prior state
    }
    // durably land every committed rename before reporting success (still not multi-file atomic —
    // that needs the journal in CP-01 — but each installed blob now survives power loss).
    for (const dir of new Set(staged.map((s) => dirname(s.path)))) this.fsyncDir(dir);
    for (const { bak } of committed) { if (bak) { try { unlinkSync(bak); } catch { /* ignore */ } } }
  }

  /** rename seam used by the commit/restore phase of writeJsonAll — overridable in tests to
   *  inject a mid-commit failure. */
  commitRename(from: string, to: string): void {
    renameSync(from, to);
  }

  /** fsync a file's bytes to stable storage. Separate seam so tests can observe the barrier. */
  fsyncFile(path: string): void {
    const fd = openSync(path, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }

  /** fsync a directory so a rename into it survives power loss. Best-effort: some platforms
   *  (e.g. Windows) reject a directory fsync — there durability falls back to the OS. */
  fsyncDir(dir: string): void {
    let fd: number | undefined;
    try {
      fd = openSync(dir, "r");
      fsyncSync(fd);
    } catch {
      /* directory fsync unsupported — best-effort */
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  writeText(path: string, text: string): void {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${this.#counter++}.tmp`;
    writeFileSync(tmp, text, { mode: 0o600 });
    this.fsyncFile(tmp);
    renameSync(tmp, path);
    this.fsyncDir(dirname(path));
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
