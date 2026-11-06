import { ExecutionError } from "../errors/index.js";

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

// Missing documents are current; invalid versions must not trigger migration.
export function storedVersionOf(doc: unknown, currentVersion: number, label: string): number {
  if (doc === null || doc === undefined) return currentVersion;
  const version = (doc as { version?: unknown }).version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ExecutionError("encoding_error", `${label} has an invalid schema version`);
  }
  return version;
}
