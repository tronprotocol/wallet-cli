/**
 * The startup migration gate (ADR-0008). Runs on every invocation before help/meta handling,
 * argument validation, or command dispatch.
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
 * Consent and authentication are independent. Every interactive migration asks before rewriting
 * wallet state; a secretless upgrade (ledger / watch only) simply skips the password step after
 * consent. Non-interactive secretless migrations remain automatic so CI can self-heal.
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

export interface MigrationGateOutcome {
  status: "current" | "upgraded" | "cancelled";
  files: PendingUpgrade[];
}

export interface MigrationPrompt {
  /** Report every pending upgrade before any prompt or write. */
  notice?(pending: PendingUpgrade[], needsPassword: boolean): void;
  /**
   * Explain the pending upgrade and return the user's answer. Called for every stale plan when an
   * interactive caller supplies it, and always before `password()`.
   *
   * Non-interactive callers return true: secretless plans then apply automatically, while
   * password-bearing plans let `password()` produce migration_required when no source exists.
   */
  confirm?(pending: PendingUpgrade[]): Promise<boolean>;
  /** The master password, or null when none can be obtained (no TTY and no --password-stdin). */
  password(): Promise<string | null>;
  /** Report the atomic backup + rewrite immediately before it starts. */
  applying?(pending: PendingUpgrade[]): void;
}

export async function runMigrationGate(
  runner: MigrationRunner,
  steps: MigrationStep[],
  prompt: MigrationPrompt,
): Promise<MigrationGateOutcome> {
  // No early exit for "nothing stale" is needed: planMigrations only aggregates needsPassword
  // over stale files, and apply() no-ops on an empty set. Mutation testing proved the guard dead.
  const plan = runner.plan(steps);
  const pending = plan.stale.map(pendingUpgrade);
  if (pending.length === 0) return { status: "current", files: [] };

  prompt.notice?.(pending, plan.needsPassword);

  let password: string | undefined;
  if (prompt.confirm && !(await prompt.confirm(pending))) {
    return { status: "cancelled", files: pending };
  }

  if (plan.needsPassword) {
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

  prompt.applying?.(pending);
  runner.apply(plan.stale, password);
  return { status: "upgraded", files: pending };
}

function pendingUpgrade(file: StaleFile): PendingUpgrade {
  return {
    path: file.step.path,
    from: file.storedVersion,
    to: file.step.currentVersion,
    backup: backupPathFor(file.step.path, file.storedVersion),
  };
}
