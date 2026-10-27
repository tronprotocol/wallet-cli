// Gate wallet commands on migration; public help and discovery bypass this gate.
import { UsageError } from "../domain/errors/index.js";
import {
  backupPathFor,
  type MigrationRunner,
  type MigrationStep,
  type StaleFile,
} from "../adapters/outbound/persistence/migration.js";

export interface PendingUpgrade {
  path: string;
  from: number;
  to: number;
  // Pre-upgrade backup, never removed automatically.
  backup: string;
}

export interface MigrationGateOutcome {
  status: "current" | "upgraded" | "cancelled";
  files: PendingUpgrade[];
}

export interface MigrationPrompt {
  // Report pending upgrades before prompting or writing.
  notice?(pending: PendingUpgrade[], needsPassword: boolean): void;
  // Ask consent before requesting a password; noninteractive callers may return true.
  confirm?(pending: PendingUpgrade[]): Promise<boolean>;
  // Return null when no password source is available.
  password(): Promise<string | null>;
  // Report the backup and rewrite immediately before applying the plan.
  applying?(pending: PendingUpgrade[]): void;
}

export async function runMigrationGate(
  runner: MigrationRunner,
  steps: MigrationStep[],
  prompt: MigrationPrompt,
): Promise<MigrationGateOutcome> {
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
