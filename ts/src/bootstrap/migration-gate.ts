/**
 * The startup migration gate (ADR-0008). Runs before any command dispatches, after the
 * help/meta short-circuit so `--help` stays reachable on a stale or unmigratable keystore.
 *
 * The gate is absolute: while a registered file lags this binary, no command runs. That is what
 * lets `ChainAddresses` stay total instead of degrading to a partial map everywhere.
 *
 * Consent: rewriting someone's wallet file and decrypting their seed to do it is not something to
 * spring on them. When the upgrade needs the master password, the gate explains what will change
 * and takes an answer BEFORE asking for the password. Previously the entire upgrade surfaced as a
 * bare "Master password (hidden):" prompt — no reason given, no mention that a file was about to
 * be rewritten, and no way to say no except Ctrl+C.
 *
 * A secretless upgrade (ledger / watch only) stays silent, as ADR-0008 requires: there is nothing
 * to decrypt, nothing to ask for, and no cost to weigh.
 */
import { UsageError } from "../domain/errors/index.js";
import {
  backupPathFor,
  type MigrationRunner,
  type MigrationStep,
  type StaleFile,
} from "../adapters/outbound/persistence/migration.js";

/** One file the upgrade will rewrite, in the terms a user needs to weigh it. */
export interface PendingUpgrade {
  path: string;
  from: number;
  to: number;
  /** where the pre-upgrade copy is kept; never removed automatically. */
  backup: string;
}

export interface MigrationPrompt {
  /**
   * Explain the pending upgrade and return the user's answer. Called ONLY when the upgrade needs
   * the master password, and always before `password()`.
   *
   * Non-interactive callers return true: there is no one to ask, and `password()` then produces
   * the `migration_required` error on its own.
   */
  confirm?(pending: PendingUpgrade[]): Promise<boolean>;
  /** The master password, or null when none can be obtained (no TTY and no --password-stdin). */
  password(): Promise<string | null>;
}

export async function runMigrationGate(
  runner: MigrationRunner,
  steps: MigrationStep[],
  prompt: MigrationPrompt,
): Promise<void> {
  // No early exit for "nothing stale" is needed: planMigrations only aggregates needsPassword
  // over stale files, and apply() no-ops on an empty set. Mutation testing proved the guard dead.
  const plan = runner.plan(steps);

  let password: string | undefined;
  if (plan.needsPassword) {
    if (prompt.confirm && !(await prompt.confirm(plan.stale.map(pendingUpgrade)))) {
      throw new UsageError(
        "migration_required",
        "upgrade declined; this version cannot run against a wallet file from an older one. " +
          "Re-run any command and answer yes, or pipe the master password with --password-stdin",
      );
    }
    const supplied = await prompt.password();
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

function pendingUpgrade(file: StaleFile): PendingUpgrade {
  return {
    path: file.step.path,
    from: file.storedVersion,
    to: file.step.currentVersion,
    backup: backupPathFor(file.step.path, file.storedVersion),
  };
}
