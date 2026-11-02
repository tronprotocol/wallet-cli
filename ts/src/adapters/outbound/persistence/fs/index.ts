import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { ExecutionError } from "../../../../domain/errors/index.js";
import {
  DeadlineExpiredError,
  type ExecutionDeadline,
} from "../../../../application/contracts/deadline.js";

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

function lockHolder(lock: string): string {
  try {
    const pid = parseInt(readFileSync(lock, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? `, held by process ${pid}` : "";
  } catch {
    return "";
  }
}

// Windows cannot open directory handles for fsync.
const DIR_FSYNC_SUPPORTED = process.platform !== "win32";

export class AtomicFileStore {
  // Bounds lock waits and refuses to start a locked write after expiry; a started write finishes.
  constructor(private readonly deadline?: ExecutionDeadline) {}

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
  // Returns the backup copies that could not be removed after the commit.
  writeJsonAll(entries: Array<{ path: string; value: unknown }>): string[] {
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
    const retained: string[] = [];
    for (const { bak } of committed) {
      if (bak) {
        try {
          unlinkSync(bak);
        } catch {
          retained.push(bak);
        }
      }
    }
    return retained;
  }

  // Commit point: the journal switching from "staged" to "committed". Callers run recoverJournal under
  // the same lock first; it rolls back an earlier interruption and rolls forward a later one.
  writeJsonJournaled(
    journalPath: string,
    entries: Array<{ path: string; value: unknown }>,
  ): JournaledWriteOutcome {
    const root = dirname(journalPath);
    const files = entries.map(({ path }) => journalFile(root, path));
    try {
      this.writeJson(journalPath, { version: 1, state: "staged", files } satisfies Journal);
      for (const { path, value } of entries) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(stagedPath(path), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
        this.fsyncFile(stagedPath(path));
      }
      for (const dir of new Set(entries.map(({ path }) => dirname(path)))) this.fsyncDir(dir);
      this.writeJson(journalPath, { version: 1, state: "committed", files } satisfies Journal);
    } catch (error) {
      // A journal published before its directory fsync failed is still committed.
      if (this.#readJournal(journalPath)?.state !== "committed") {
        try {
          this.recoverJournal(journalPath);
        } catch {
          // The previous files are untouched; the next recoverJournal removes the staged copies.
        }
        throwIoError(error, "journaled write failed before its commit point; nothing was changed");
      }
    }
    try {
      this.recoverJournal(journalPath);
      return { complete: true };
    } catch (error) {
      return { complete: false, error };
    }
  }

  // Idempotent; safe to rerun after an interruption at any step.
  recoverJournal(journalPath: string): void {
    this.#removeJournalTemps(journalPath);
    const journal = this.#readJournal(journalPath);
    if (journal === null) return;
    const root = dirname(journalPath);
    const paths = journal.files.map((file) => join(root, file));
    try {
      if (journal.state === "committed") {
        for (const path of paths) {
          if (existsSync(stagedPath(path))) this.commitRename(stagedPath(path), path);
        }
      } else {
        for (const path of paths) rmSync(stagedPath(path), { force: true });
      }
      for (const dir of new Set(paths.map((path) => dirname(path)))) this.fsyncDir(dir);
      unlinkSync(journalPath);
      this.fsyncDir(root);
    } catch (error) {
      throwIoError(error, `could not finish the interrupted write recorded in ${journalPath}`);
    }
  }

  // Callers hold the lock that guards journal writes, so a temp file of the journal belongs to a killed
  // process; a published journal never depends on one.
  #removeJournalTemps(journalPath: string): void {
    const dir = dirname(journalPath);
    const prefix = `${basename(journalPath)}.`;
    try {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        if (name.startsWith(prefix) && /^\d+\.\d+\.tmp$/.test(name.slice(prefix.length))) {
          rmSync(join(dir, name), { force: true });
        }
      }
    } catch (error) {
      throwIoError(error, `could not remove the temporary files of ${journalPath}`);
    }
  }

  #readJournal(journalPath: string): Journal | null {
    const raw = this.readJson<unknown>(journalPath);
    if (raw === null) return null;
    const journal = raw as Partial<Journal>;
    if (
      journal.version !== 1 ||
      (journal.state !== "staged" && journal.state !== "committed") ||
      !Array.isArray(journal.files) ||
      !journal.files.every(isJournalFile)
    ) {
      throw new ExecutionError("encoding_error", `invalid write journal at ${journalPath}`);
    }
    return journal as Journal;
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
    const lockWaitMs = opts.timeoutMs ?? 5000;
    const remainingMs = this.deadline?.remainingMs() ?? Number.POSITIVE_INFINITY;
    const waitUntil = Date.now() + Math.min(lockWaitMs, remainingMs);
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
        if (Date.now() > waitUntil) {
          const blocked = `lock ${lock}${lockHolder(lock)}; if no wallet-cli command is running, delete ${lock} and retry`;
          if (remainingMs < lockWaitMs) {
            throw new DeadlineExpiredError(
              `the command did not finish within its time limit while waiting for ${blocked}`,
            );
          }
          throw new ExecutionError("execution_error", `timed out acquiring ${blocked}`);
        }
        sleepMs(25);
      }
    }
    try {
      this.deadline?.assertActive();
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

export type JournaledWriteOutcome = { complete: true } | { complete: false; error: unknown };

interface Journal {
  version: 1;
  state: "staged" | "committed";
  // Relative to the journal's directory.
  files: string[];
}

function stagedPath(path: string): string {
  return `${path}.next`;
}

function journalFile(root: string, path: string): string {
  const file = relative(root, path).split(sep).join("/");
  if (!isJournalFile(file)) {
    throw new ExecutionError("io_error", `journaled write target is outside ${root}: ${path}`);
  }
  return file;
}

// A tampered journal must not name a path outside its directory.
function isJournalFile(file: unknown): file is string {
  return (
    typeof file === "string" &&
    file !== "" &&
    !isAbsolute(file) &&
    file.split(/[\\/]/).every((part) => part !== "" && part !== "." && part !== "..")
  );
}

function throwIoError(error: unknown, message: string): never {
  if (error instanceof ExecutionError) throw error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (typeof code === "string") {
    throw new ExecutionError("io_error", message, { code });
  }
  throw error;
}
