import type { DataMigrations, PendingUpgrade } from "../ports/data-migration.js";
import { errorMessage, inputRef, UsageError } from "../../domain/errors/index.js";

export interface MigrationOutcome {
  status: "current" | "upgraded" | "cancelled";
  files: PendingUpgrade[];
  // Temporary rollback copies that could not be removed after an upgrade.
  retainedBackups?: string[];
}

export interface MigrationPrompt {
  // False when no one can answer; the upgrade then proceeds without asking consent.
  readonly interactive: boolean;
  // Report pending upgrades before prompting or writing.
  notice?(pending: PendingUpgrade[], needsPassword: boolean): void;
  confirm(pending: PendingUpgrade[]): Promise<boolean>;
  // Return null when no password source is available.
  password(): Promise<string | null>;
  // Report the backup and rewrite immediately before applying the plan.
  applying?(pending: PendingUpgrade[]): void;
}

// Upgrades stored data before a wallet command runs.
export class MigrationService {
  constructor(private readonly migrations: DataMigrations) {}

  async run(prompt: MigrationPrompt): Promise<MigrationOutcome> {
    const plan = this.migrations.plan();
    const pending = plan.pending;
    if (pending.length === 0) return { status: "current", files: [] };

    prompt.notice?.(pending, plan.needsPassword);

    // Consent comes before the password prompt.
    if (prompt.interactive && !(await prompt.confirm(pending))) {
      return { status: "cancelled", files: pending };
    }

    let password: string | undefined;
    if (plan.needsPassword) {
      const supplied = await prompt.password();
      if (supplied === null) {
        throw new UsageError(
          "migration_required",
          errorMessage`this wallet file was created by an older version and must be updated before any command can run; run wallet-cli in a terminal, or pipe the master password with ${inputRef("passwordStdin")}`,
        );
      }
      password = supplied;
    }

    prompt.applying?.(pending);
    const retainedBackups = this.migrations.apply(pending, password);
    return { status: "upgraded", files: pending, retainedBackups };
  }
}
