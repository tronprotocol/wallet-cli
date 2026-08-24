import { ExecutionError } from "../errors/index.js";

/**
 * Migration planning — pure decisions about which persisted files lag the running binary.
 * Reading versions and applying migrations is I/O and lives in the adapters; this module only
 * decides what is stale and what that will cost.
 */

export interface MigrationCandidate {
  path: string;
  currentVersion: number;
  storedVersion: number;
  needsPassword: boolean;
}

export interface MigrationPlan {
  stale: MigrationCandidate[];
  needsPassword: boolean;
}

export function planMigrations(candidates: MigrationCandidate[]): MigrationPlan {
  const stale = candidates.filter((c) => c.storedVersion < c.currentVersion);
  return { stale, needsPassword: stale.some((c) => c.needsPassword) };
}

/**
 * The version a stored document reports. An ABSENT file (readJson → null) is a fresh install,
 * not a stale one: it reports the current version so the gate leaves it alone and `create`
 * can run on a clean machine.
 *
 * Anything present but without a usable version is CORRUPT, never "version 0". Reading it as 0
 * would run a migration against a shape we know nothing about, on a file holding wallet state.
 */
export function storedVersionOf(doc: unknown, currentVersion: number, label: string): number {
  if (doc === null || doc === undefined) return currentVersion;
  const version = (doc as { version?: unknown }).version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ExecutionError("encoding_error", `${label} has an invalid schema version`);
  }
  return version;
}
