import packageMetadata from "../../package.json" with { type: "json" };
import type { ExitCode, OutputMode } from "../domain/types/index.js";
import { CONFIG_DEFAULTS } from "../application/contracts/config-defaults.js";
import { redactErrorMessage, setRedactedHomeDirectory } from "../domain/errors/redact.js";
import { HelpService, hasMeta } from "../adapters/inbound/cli/help/index.js";
import { assertNoTailFlags, buildCli } from "../adapters/inbound/cli/shell/index.js";
import { createOutputFormatter } from "../adapters/inbound/cli/output/index.js";
import { maskCredentials } from "../adapters/inbound/cli/output/mask.js";
import { exitCodeOf, normalizeCliError } from "../adapters/inbound/cli/output/errors.js";
import { StreamManager } from "../adapters/inbound/cli/stream/index.js";
import {
  commandTokens,
  hasCommand,
  invalidGlobalError,
  parseGlobals,
  stdinConflictError,
} from "../adapters/inbound/cli/globals/argv.js";
import {
  cliMigrationPrompt,
  renderMigrationOutcome,
} from "../adapters/inbound/cli/migration/index.js";
import { composeCliRuntime } from "./composition.js";
import { homedir } from "node:os";

export const VERSION = packageMetadata.version;

// Bootstrap failures use argv output settings because config may be unreadable.
function reportBootstrapFailure(
  error: unknown,
  globals: { output?: OutputMode; verbose?: boolean },
  startedAt: number,
): ExitCode {
  const output = globals.output ?? CONFIG_DEFAULTS.defaultOutput;
  const normalized = normalizeCliError(error);
  const streams = new StreamManager(output, globals.verbose ?? false);
  if (normalized.code === "internal_error") {
    streams.diagnostic("debug", `bootstrap error: ${redactErrorMessage(String(error))}`);
  }
  createOutputFormatter(output, streams, startedAt).error(normalized);
  return exitCodeOf(normalized);
}

export async function main(argv: string[]): Promise<ExitCode> {
  const startedAt = Date.now();
  setRedactedHomeDirectory(homedir());
  const tokens = commandTokens(argv);
  const { globals, secretPaths, invalid, stdinFlags } = parseGlobals(tokens);

  // Reject competing stdin secrets before migration or command logic can consume stdin.
  const stdinConflict = stdinConflictError(stdinFlags);
  if (stdinConflict) return reportBootstrapFailure(stdinConflict, globals, startedAt);

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

    // Migrate before dispatch; public help and discovery bypass this gate. The original command
    // never runs after a cancelled or completed upgrade.
    const migration = await runtime.migrations.run(cliMigrationPrompt(runtime.deps));
    if (renderMigrationOutcome(migration, runtime.streams, runtime.formatter)) return 0;

    const invalidGlobal = invalidGlobalError(invalid);
    if (invalidGlobal) throw invalidGlobal;

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
    const normalized = normalizeCliError(error);
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
    return exitCodeOf(normalized);
  } finally {
    runtime.deps.secrets.clearPrimed();
    runtime.prompter.close();
  }
}
