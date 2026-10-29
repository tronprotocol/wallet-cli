import packageMetadata from "../../package.json" with { type: "json" };
import { runMigrationGate, type PendingUpgrade } from "./migration-gate.js";
import { migrationSteps } from "./migration-steps.js";
import { MigrationRunner } from "../adapters/outbound/persistence/migration.js";
import { hideBin } from "yargs/helpers";
import type { ExitCode, OutputMode } from "../domain/types/index.js";
import { normalizeError, UsageError } from "../domain/errors/index.js";
import { redactErrorMessage, setRedactedHomeDirectory } from "../domain/errors/redact.js";
import { HelpService, hasMeta } from "../adapters/inbound/cli/help/index.js";
import { assertNoTailFlags, buildCli } from "../adapters/inbound/cli/shell/index.js";
import { createOutputFormatter } from "../adapters/inbound/cli/output/index.js";
import { maskCredentials } from "../adapters/inbound/cli/output/mask.js";
import { StreamManager } from "../adapters/inbound/cli/stream/index.js";
import { hasCommand, parseGlobals } from "./argv.js";
import { composeCliRuntime } from "./composition.js";
import { basename } from "node:path";
import { homedir } from "node:os";

export const VERSION = packageMetadata.version;

// Bootstrap failures use argv output settings because config may be unreadable.
function reportBootstrapFailure(
  error: unknown,
  globals: { output?: OutputMode; verbose?: boolean },
  startedAt: number,
): ExitCode {
  const output = globals.output ?? "text";
  const normalized = normalizeError(error);
  const streams = new StreamManager(output, globals.verbose ?? false);
  if (normalized.code === "internal_error") {
    streams.diagnostic("debug", `bootstrap error: ${redactErrorMessage(String(error))}`);
  }
  createOutputFormatter(output, streams, startedAt).error(normalized);
  return normalized.exitCode();
}

export async function main(argv: string[]): Promise<ExitCode> {
  const startedAt = Date.now();
  setRedactedHomeDirectory(homedir());
  const tokens = hideBin(argv);
  const { globals, secretPaths, invalid, stdinFlags } = parseGlobals(tokens);

  // Reject competing stdin secrets before migration or command logic can consume stdin.
  if (stdinFlags.length > 1) {
    return reportBootstrapFailure(
      new UsageError(
        "invalid_option",
        `${stdinFlags.join(" and ")} cannot be combined: only one secret may be read from stdin per run`,
      ),
      globals,
      startedAt,
    );
  }

  let runtime: ReturnType<typeof composeCliRuntime>;
  try {
    runtime = composeCliRuntime({ globals, secretPaths, startedAt });
  } catch (error) {
    return reportBootstrapFailure(error, globals, startedAt);
  }

  try {
    if (hasMeta(tokens) || !hasCommand(tokens)) {
      const help = new HelpService(
        runtime.registry,
        runtime.streams,
        VERSION,
        runtime.capabilities,
      );
      return help.handleMeta(hasMeta(tokens) ? tokens : ["--help"]);
    }

    // Migrate before dispatch; public help and discovery bypass this gate.
    const migration = await runMigrationGate(
      new MigrationRunner(runtime.store),
      migrationSteps(runtime.root, runtime.store),
      {
        notice: (pending, needsPassword) => {
          for (const line of upgradeNotice(pending, needsPassword)) {
            runtime.streams.diagnostic("info", line);
          }
        },
        confirm: async (_pending) => {
          const { prompter } = runtime.deps;
          // Noninteractive secretless upgrades are automatic; other plans require a password source.
          if (!prompter.isTTY()) return true;
          return prompter.select({
            label: "Wallet data upgrade",
            choices: [
              { value: true, label: "Upgrade now" },
              { value: false, label: "Exit without upgrading" },
            ],
          });
        },
        password: async () => {
          const { secrets, keystore, prompter } = runtime.deps;
          if (!secrets.hasMasterPassword() && !prompter.isTTY()) return null;
          runtime.streams.diagnostic("info", "==> Verifying master password");
          await secrets.primePassword({
            mode: "verify",
            verify: (pw) => keystore.verifyPassword(pw),
          });
          return secrets.masterPassword();
        },
        applying: () => {
          runtime.streams.diagnostic("info", "==> Backing up and upgrading wallet data");
        },
      },
    );

    // Stop after cancellation or upgrade; never dispatch the original command.
    if (migration.status === "cancelled") {
      const data = {
        upgraded: false,
        cancelled: true,
        files: migration.files.map(({ path, from, to }) => ({ path, from, to })),
        originalCommandExecuted: false,
      };
      runtime.streams.result(
        runtime.formatter.success("migration", undefined, data, () =>
          upgradeCancelledNotice(migration.files).join("\n"),
        ),
      );
      return 0;
    }

    if (migration.status === "upgraded") {
      for (const path of migration.retainedBackups ?? []) {
        runtime.streams.diagnostic("warn", {
          code: "backup_file_not_removed",
          message: `the upgrade is complete, but its temporary rollback copy could not be removed: ${path}; delete that file yourself`,
        });
      }
      const data = {
        upgraded: true,
        files: migration.files.map(({ path, from, to, backup }) => ({ path, from, to, backup })),
        originalCommandExecuted: false,
      };
      runtime.streams.result(
        runtime.formatter.success("migration", undefined, data, () =>
          upgradeCompleteNotice(migration.files).join("\n"),
        ),
      );
      return 0;
    }

    if (invalid.length > 0) {
      const bad = invalid[0]!;
      throw new UsageError(
        "invalid_value",
        `invalid ${bad.flag} value "${bad.value}": ${bad.reason}`,
      );
    }

    // Reject reserved tail flags before yargs makes them indistinguishable from command fields.
    assertNoTailFlags(tokens);

    const cli = buildCli({
      registry: runtime.registry,
      globals,
      deps: runtime.deps,
      targetResolver: runtime.targetResolver,
      caps: runtime.capabilities,
      streams: runtime.streams,
      formatter: runtime.formatter,
      session: runtime.session,
    });
    await cli.parseAsync(tokens);
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.code === "internal_error") {
      runtime.streams.diagnostic(
        "debug",
        maskCredentials(`internal error: ${String(error)}`, runtime.credentials),
      );
    }
    runtime.formatter.error(normalized, {
      commandId: runtime.session.current?.commandId,
      net: runtime.session.current?.net,
    });
    return normalized.exitCode();
  } finally {
    runtime.deps.secrets.clearPrimed();
    runtime.prompter.close();
  }
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
      `    Schema: v${f.from} \u2192 v${f.to}`,
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
