/**
 * MigrationRunner — reads each registered file, decides what lags this binary, and applies the
 * pending migrations as one transaction. Splitting plan from apply is deliberate: the gate must
 * know whether a password will be needed BEFORE it prompts for one.
 */
import { planMigrations, storedVersionOf } from "../../../domain/migration/index.js";
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

export interface StaleFile {
  step: MigrationStep;
  doc: unknown;
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
    const docs = new Map<string, unknown>();
    const candidates = steps.map((step) => {
      const doc = this.store.readJson<unknown>(step.path);
      docs.set(step.path, doc);
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
        doc: docs.get(c.path),
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

  private commit(stale: StaleFile[], password: string | undefined): void {
    this.store.writeJsonAll(
      stale.flatMap(({ step, doc, storedVersion }) => [
        { path: backupPathFor(step.path, storedVersion), value: doc },
        { path: step.path, value: step.migrate(doc, password) },
      ]),
    );
  }
}
