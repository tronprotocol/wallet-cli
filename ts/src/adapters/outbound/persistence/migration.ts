// Plan separately to determine password needs before prompting.
import { planMigrations, storedVersionOf } from "../../../domain/migration/index.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import type { AtomicFileStore } from "./fs/index.js";

export interface MigrationStep {
  // Absolute path.
  path: string;
  currentVersion: number;
  needsPassword(doc: unknown): boolean;
  // Password is supplied when the plan requires it.
  migrate(doc: unknown, password?: string): unknown;
}

// Carry versions, not documents: commit must re-read each file under its lock.
export interface StaleFile {
  step: MigrationStep;
  storedVersion: number;
}

export interface RunnerPlan {
  stale: StaleFile[];
  needsPassword: boolean;
}

// Pre-migration copies persist after a successful write.
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

  // Migrated documents and backup copies share one rollback batch. Returns the rollback copies left
  // on disk after the commit.
  apply(stale: StaleFile[], password?: string): string[] {
    if (stale.length === 0) return [];
    return this.write(stale, password);
  }

  // Hold all file locks across the complete read-modify-write.
  private write(stale: StaleFile[], password: string | undefined, held = 0): string[] {
    if (held === stale.length) return this.commit(stale, password);
    return this.store.withLock(stale[held]!.step.path, () => this.write(stale, password, held + 1));
  }

  // Re-read under lock to preserve changes made while confirmation or password prompts were open.
  private commit(stale: StaleFile[], password: string | undefined): string[] {
    const writes: Array<{ path: string; value: unknown }> = [];
    for (const { step, storedVersion } of stale) {
      const doc = this.store.readJson<unknown>(step.path);
      const found = storedVersionOf(doc, step.currentVersion, step.path);
      if (found === step.currentVersion) continue;
      if (found !== storedVersion) {
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
    if (writes.length === 0) return [];
    return this.store.writeJsonAll(writes);
  }
}
