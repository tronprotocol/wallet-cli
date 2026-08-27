import { runMigrationGate, type PendingUpgrade } from "./migration-gate.js";
import { migrationSteps } from "./migration-steps.js";
import { MigrationRunner } from "../adapters/outbound/persistence/migration.js";
import { hideBin } from "yargs/helpers";
import type { ExitCode, OutputMode } from "../domain/types/index.js";
import { normalizeError, UsageError } from "../domain/errors/index.js";
import { redactErrorMessage } from "../domain/errors/redact.js";
import { HelpService, hasMeta } from "../adapters/inbound/cli/help/index.js";
import { assertNoTailFlags, buildCli } from "../adapters/inbound/cli/shell/index.js";
import { createOutputFormatter } from "../adapters/inbound/cli/output/index.js";
import { StreamManager } from "../adapters/inbound/cli/stream/index.js";
import { hasCommand, parseGlobals } from "./argv.js";
import { composeCliRuntime } from "./composition.js";
import { basename } from "node:path";

export const VERSION = "4.12.0";

/**
 * Report a failure raised while the composition root was still being built — an unreadable,
 * insecure, or malformed `config.yaml`. These happen before the runtime exists, so they cannot use
 * the normal error path, and without this they escape `main()` entirely and land on the last-resort
 * guard in `index.ts` as a bare `fatal:` line at exit 1 — no envelope, and the wrong exit code for
 * what is a UsageError.
 *
 * Everything here depends on argv alone: the config that would have supplied the default output
 * mode is precisely what failed, so only an explicit `-o` is honoured and text is the fallback.
 * `normalizeError` still does the redacting — a YAML parse error quotes the offending line, which
 * may sit next to a service credential, so it is classified to a generic `internal_error` rather
 * than surfaced.
 */
function reportBootstrapFailure(
  error: unknown,
  globals: { output?: OutputMode; verbose?: boolean },
  startedAt: number,
): ExitCode {
  const output = globals.output ?? "text";
  const normalized = normalizeError(error);
  const streams = new StreamManager(output, globals.verbose ?? false);
  if (normalized.code === "internal_error") {
    // same --verbose-gated escape hatch the main path offers, minus paths/URLs
    streams.diagnostic("debug", `bootstrap error: ${redactErrorMessage(String(error))}`);
  }
  createOutputFormatter(output, streams, startedAt).error(normalized);
  return normalized.exitCode();
}

/** Execute one CLI invocation. Dependency construction is delegated to the composition root. */
export async function main(argv: string[]): Promise<ExitCode> {
  const startedAt = Date.now();
  const tokens = hideBin(argv);
  const { globals, secretPaths, invalid } = parseGlobals(tokens);

  let runtime: ReturnType<typeof composeCliRuntime>;
  try {
    runtime = composeCliRuntime({ globals, secretPaths, startedAt });
  } catch (error) {
    return reportBootstrapFailure(error, globals, startedAt);
  }

  try {
    // Every invocation runs the migration preflight before help, version, schema output, argument
    // validation, or command dispatch. A current/absent wallet is a no-op; stale state is handled
    // consistently regardless of which surface caused wallet-cli to start — ADR-0008.
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
          // Non-interactive secretless plans migrate automatically; password-bearing plans fall
          // through to password(), which raises migration_required if no stdin source exists.
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

    // Startup changed durable wallet state. End this invocation at that boundary instead of
    // silently dispatching the command the user typed before they saw the upgrade.
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

    if (hasMeta(tokens) || !hasCommand(tokens)) {
      const help = new HelpService(runtime.registry, runtime.streams, VERSION);
      return help.handleMeta(hasMeta(tokens) ? tokens : ["--help"]);
    }

    // A supplied global flag with an out-of-range/invalid value is a usage error — never a silent
    // fall-back to the default. Reported before command dispatch, so no RPC is attempted.
    if (invalid.length > 0) {
      const bad = invalid[0]!;
      throw new UsageError(
        "invalid_value",
        `invalid ${bad.flag} value "${bad.value}": ${bad.reason}`,
      );
    }

    // yargs stores a grouped command's tail in argv.group/verb/args, so those names must stay in
    // the per-command flag allowlist — which leaves a user-typed `--args` indistinguishable from
    // plumbing once parsed. The raw tokens still tell them apart.
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
      runtime.streams.diagnostic("debug", `internal error: ${String(error)}`);
    }
    runtime.formatter.error(normalized, {
      commandId: runtime.session.current?.commandId,
      net: runtime.session.current?.net,
    });
    return normalized.exitCode();
  } finally {
    runtime.deps.secrets.clearPrimed(); // release cached secrets at end of the invocation
    runtime.prompter.close();
  }
}

/** Goes to stderr at `info`, so stdout stays reserved for command output. */
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
