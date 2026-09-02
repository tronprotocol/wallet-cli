/**
 * MigrationRunner — reads each registered file, decides what lags this binary, and applies the
 * pending migrations as one transaction. Splitting plan from apply is deliberate: the gate must
 * know whether a password will be needed BEFORE it prompts for one.
 */
import { planMigrations, storedVersionOf } from "../../../domain/migration/index.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import type { AtomicFileStore } from "./fs/index.js";

export interface MigrationStep {
  /** absolute path of the file this step owns. */
  path: string;
  /** the version this binary expects the file to be at. */
  currentVersion: number;
  /** whether migrating THIS document needs the master password (contents decide, not the file). */
  needsPassword(doc: unknown): boolean;
  /** `password` is present only when this step's needsPassword() said so. */
  migrate(doc: unknown, password?: string): unknown;
}

/**
 * A file the plan found lagging, named by the version it was AT when planned. The document itself
 * is deliberately not carried: `commit()` re-reads it under the lock, and a copy kept here would
 * only be the stale read that copy exists to avoid.
 */
export interface StaleFile {
  step: MigrationStep;
  storedVersion: number;
}

export interface RunnerPlan {
  stale: StaleFile[];
  needsPassword: boolean;
}

/** stable, never-pruned name for a file's pre-migration copy. */
export function backupPathFor(path: string, storedVersion: number): string {
  return `${path}.v${storedVersion}.bak`;
}

export class MigrationRunner {
  constructor(private readonly store: AtomicFileStore) {}

  plan(steps: MigrationStep[]): RunnerPlan {
    const candidates = steps.map((step) => {
      const doc = this.store.readJson<unknown>(step.path);
      return {
        path: step.path,
        currentVersion: step.currentVersion,
        storedVersion: storedVersionOf(doc, step.currentVersion, step.path),
        needsPassword: doc === null ? false : step.needsPassword(doc),
      };
    });

    const plan = planMigrations(candidates);
    const byPath = new Map(steps.map((s) => [s.path, s]));
    return {
      stale: plan.stale.map((c) => ({
        step: byPath.get(c.path)!,
        storedVersion: c.storedVersion,
      })),
      needsPassword: plan.needsPassword,
    };
  }

  /**
   * Applies every pending migration as ONE transaction: either the whole set lands, or none.
   * The pre-migration copies ride inside the same transaction, so a rollback removes them too —
   * nothing changed, so there is nothing to recover from.
   */
  apply(stale: StaleFile[], password?: string): void {
    if (stale.length === 0) return;
    this.write(stale, password);
  }

  /**
   * Nested locks, one per migrated file, so the whole read-modify-write sits inside them — the
   * same discipline every keystore mutator follows.
   *
   * Without it the race is the worst kind available here: process A reads the v1 document and
   * blocks on an interactive password prompt while process B migrates and creates an account
   * under the lock; A then writes the migration of its now-stale read, erasing B's account and
   * orphaning its encrypted key blob.
   */
  private write(stale: StaleFile[], password: string | undefined, held = 0): void {
    if (held === stale.length) return this.commit(stale, password);
    this.store.withLock(stale[held]!.step.path, () => this.write(stale, password, held + 1));
  }

  /**
   * Re-read under the lock, and migrate what is ON DISK rather than what `plan()` captured.
   *
   * The snapshot is older than the lock by the whole length of the gate's notice, consent and
   * password prompt, so anything another process committed in that window is missing from it and
   * writing it back would erase that work.
   *
   * A version comparison is enough to detect any such change: the gate is absolute, so a second
   * process cannot touch a stale file without migrating it first, and migrating it moves the
   * version. Hashing the document would cost more and catch nothing extra.
   */
  private commit(stale: StaleFile[], password: string | undefined): void {
    const writes: Array<{ path: string; value: unknown }> = [];
    for (const { step, storedVersion } of stale) {
      const doc = this.store.readJson<unknown>(step.path);
      const found = storedVersionOf(doc, step.currentVersion, step.path);
      // Another process ran this same upgrade while we waited. The file already holds what this
      // binary wants, so there is nothing to write — and nothing to take a copy of either.
      if (found === step.currentVersion) continue;
      if (found !== storedVersion) {
        // `io_error` is the closest existing code with retry: "same"; the condition is transient
        // and re-running the command re-plans against the file as it now stands. It is not worth
        // a new code in the published error vocabulary for a window this narrow.
        throw new ExecutionError(
          "io_error",
          `${step.path} changed from version ${storedVersion} to ${found} while this upgrade was ` +
            "being confirmed; nothing was written — run the command again",
        );
      }
      writes.push(
        { path: backupPathFor(step.path, found), value: doc },
        { path: step.path, value: step.migrate(doc, password) },
      );
    }
    if (writes.length === 0) return;
    this.store.writeJsonAll(writes);
  }
}
