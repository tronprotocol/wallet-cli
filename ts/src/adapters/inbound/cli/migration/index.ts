// Startup wallet-data upgrade: prompts, notices on stderr, and the result that replaces the command.
import { basename } from "node:path";
import type { PendingUpgrade } from "../../../../application/ports/data-migration.js";
import type {
  MigrationOutcome,
  MigrationPrompt,
} from "../../../../application/use-cases/migration-service.js";
import type { RuntimeDeps } from "../context/index.js";
import type { OutputFormatter } from "../output/index.js";
import type { StreamManager } from "../contracts/index.js";

export function cliMigrationPrompt(
  deps: Pick<RuntimeDeps, "streams" | "prompter" | "secrets" | "accounts">,
): MigrationPrompt {
  const { streams, prompter, secrets, accounts } = deps;
  return {
    get interactive() {
      return prompter.isTTY();
    },
    notice: (pending, needsPassword) => {
      for (const line of upgradeNotice(pending, needsPassword)) streams.diagnostic("info", line);
    },
    confirm: async () =>
      prompter.select({
        label: "Wallet data upgrade",
        choices: [
          { value: true, label: "Upgrade now" },
          { value: false, label: "Exit without upgrading" },
        ],
      }),
    password: async () => {
      if (!secrets.hasMasterPassword() && !prompter.isTTY()) return null;
      streams.diagnostic("info", "==> Verifying master password");
      await secrets.primePassword({
        mode: "verify",
        verify: (pw) => accounts.verifyPassword(pw),
      });
      return secrets.masterPassword();
    },
    applying: () => {
      streams.diagnostic("info", "==> Backing up and upgrading wallet data");
    },
  };
}

// Writes the migration result and returns true when the original command must not run.
export function renderMigrationOutcome(
  migration: MigrationOutcome,
  streams: StreamManager,
  formatter: OutputFormatter,
): boolean {
  if (migration.status === "cancelled") {
    const data = {
      upgraded: false,
      cancelled: true,
      files: migration.files.map(({ path, from, to }) => ({ path, from, to })),
      originalCommandExecuted: false,
    };
    streams.result(
      formatter.success("migration", undefined, data, () =>
        upgradeCancelledNotice(migration.files).join("\n"),
      ),
    );
    return true;
  }

  if (migration.status === "upgraded") {
    for (const path of migration.retainedBackups ?? []) {
      streams.diagnostic("warn", {
        code: "backup_file_not_removed",
        message: `the upgrade is complete, but its temporary rollback copy could not be removed: ${path}; delete that file yourself`,
      });
    }
    const data = {
      upgraded: true,
      files: migration.files.map(({ path, from, to, backup }) => ({ path, from, to, backup })),
      originalCommandExecuted: false,
    };
    streams.result(
      formatter.success("migration", undefined, data, () =>
        upgradeCompleteNotice(migration.files).join("\n"),
      ),
    );
    return true;
  }

  return false;
}

// Emit on stderr so stdout remains reserved for command output.
export function upgradeNotice(pending: PendingUpgrade[], needsPassword = true): string[] {
  return [
    "",
    "Updating wallet-cli wallet data...",
    "==> An older wallet data format was detected; an upgrade is required",
    "",
    ...pending.flatMap((f) => [
      `==> ${f.path}`,
      `    Schema: v${f.from} → v${f.to}`,
      `    Backup: ${f.backup}`,
    ]),
    "",
    "==> The backup is kept permanently; this upgrade runs only once",
    ...(needsPassword
      ? ["==> Your master password is required to update derived account data"]
      : []),
    "Release details: https://github.com/tronprotocol/wallet-cli/releases",
    "",
  ];
}

export function upgradeCompleteNotice(upgraded: PendingUpgrade[]): string[] {
  return [
    "✓ Wallet data upgrade completed successfully.",
    ...upgraded.map((file) => `  Backup saved: ${file.backup}`),
    "",
    "🎉 Upgrade complete. Please run your command again.",
  ];
}

export function upgradeCancelledNotice(pending: PendingUpgrade[]): string[] {
  return [
    "Wallet data was not upgraded. No changes were made.",
    "",
    "This version of wallet-cli does not support the existing wallet data format:",
    ...pending.map(
      (file) => `  ${basename(file.path)}: schema v${file.from} (requires v${file.to})`,
    ),
    "",
    "To continue without upgrading, use a compatible earlier release:",
    "https://github.com/tronprotocol/wallet-cli/releases",
  ];
}
