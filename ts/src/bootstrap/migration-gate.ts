/**
 * The startup migration gate (ADR-0008). Runs before any command dispatches, after the
 * help/meta short-circuit so `--help` stays reachable on a stale or unmigratable keystore.
 *
 * The gate is absolute: while a registered file lags this binary, no command runs. That is what
 * lets `ChainAddresses` stay total instead of degrading to a partial map everywhere.
 */
import { UsageError } from "../domain/errors/index.js";
import type { MigrationRunner, MigrationStep } from "../adapters/outbound/persistence/migration.js";

/** Yields the master password, or null when none can be obtained (no TTY and no --password-stdin). */
export type PasswordSource = () => Promise<string | null>;

export async function runMigrationGate(
  runner: MigrationRunner,
  steps: MigrationStep[],
  obtainPassword: PasswordSource,
): Promise<void> {
  // No early exit for "nothing stale" is needed: planMigrations only aggregates needsPassword
  // over stale files, and apply() no-ops on an empty set. Mutation testing proved the guard dead.
  const plan = runner.plan(steps);

  let password: string | undefined;
  if (plan.needsPassword) {
    const supplied = await obtainPassword();
    if (supplied === null) {
      throw new UsageError(
        "migration_required",
        "this wallet file was created by an older version and must be updated before any command " +
          "can run; run wallet-cli in a terminal, or pipe the master password with --password-stdin",
      );
    }
    password = supplied;
  }

  runner.apply(plan.stale, password);
}
