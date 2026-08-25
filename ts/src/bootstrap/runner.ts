import { runMigrationGate, type PendingUpgrade } from "./migration-gate.js";
import { migrationSteps } from "./migration-steps.js";
import { MigrationRunner } from "../adapters/outbound/persistence/migration.js";
import { hideBin } from "yargs/helpers";
import type { ExitCode, OutputMode } from "../domain/types/index.js";
import { normalizeError, UsageError } from "../domain/errors/index.js";
import { redactErrorMessage } from "../domain/errors/redact.js";
import { HelpService, hasMeta } from "../adapters/inbound/cli/help/index.js";
import { buildCli } from "../adapters/inbound/cli/shell/index.js";
import { createOutputFormatter } from "../adapters/inbound/cli/output/index.js";
import { StreamManager } from "../adapters/inbound/cli/stream/index.js";
import { hasCommand, parseGlobals } from "./argv.js";
import { composeCliRuntime } from "./composition.js";

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
    if (hasMeta(tokens) || !hasCommand(tokens)) {
      const help = new HelpService(runtime.registry, runtime.streams, VERSION);
      return help.handleMeta(hasMeta(tokens) ? tokens : ["--help"]);
    }

    // A supplied global flag with an out-of-range/invalid value is a usage error — never a silent
    // fall-back to the default. Reported before any command dispatch, so no RPC is attempted.
    if (invalid.length > 0) {
      const bad = invalid[0]!;
      throw new UsageError(
        "invalid_value",
        `invalid ${bad.flag} value "${bad.value}": ${bad.reason}`,
      );
    }

    // The migration gate runs after the meta short-circuit above (so `--help` stays reachable on a
    // stale keystore) and before any command dispatches — ADR-0008.
    await runMigrationGate(
      new MigrationRunner(runtime.store),
      migrationSteps(runtime.root, runtime.store),
      {
        confirm: async (pending) => {
          const { secrets, prompter } = runtime.deps;
          // --password-stdin already stated the intent, and there is no one to ask anyway.
          if (secrets.hasMasterPassword()) return true;
          // No terminal: fall through so password() raises migration_required, unchanged.
          if (!prompter.isTTY()) return true;
          for (const line of upgradeNotice(pending)) runtime.streams.diagnostic("info", line);
          return prompter.confirm({ label: "Upgrade now?" });
        },
        password: async () => {
          const { secrets, keystore, prompter } = runtime.deps;
          if (!secrets.hasMasterPassword() && !prompter.isTTY()) return null;
          await secrets.primePassword({
            mode: "verify",
            verify: (pw) => keystore.verifyPassword(pw),
          });
          return secrets.masterPassword();
        },
      },
    );

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
export function upgradeNotice(pending: PendingUpgrade[]): string[] {
  return [
    "",
    "This wallet was created by an earlier version of wallet-cli and must be upgraded",
    "before any command can run.",
    "",
    ...pending.map((f) => `  ${f.path}   v${f.from} \u2192 v${f.to}`),
    "",
    ...pending.map(
      (f) =>
        `A copy of the current file is kept at\n  ${f.backup}\nand is never removed automatically. The upgrade runs once.`,
    ),
    "",
    "Release details: https://github.com/tronprotocol/wallet-cli/releases",
    "",
  ];
}
