import packageMetadata from "../../package.json" with { type: "json" };
import type { ExitCode, OutputMode } from "../domain/types/index.js";
import { CONFIG_DEFAULTS } from "../application/contracts/config-defaults.js";
import { redactErrorMessage, setRedactedHomeDirectory } from "../domain/errors/redact.js";
import { HelpService, hasMeta } from "../adapters/inbound/cli/help/index.js";
import { assertNoTailFlags, buildCli } from "../adapters/inbound/cli/shell/index.js";
import { commandId } from "../adapters/inbound/cli/command-id.js";
import { createOutputFormatter } from "../adapters/inbound/cli/output/index.js";
import { exitCodeOf, normalizeCliError } from "../adapters/inbound/cli/output/errors.js";
import { StreamManager } from "../adapters/inbound/cli/stream/index.js";
import {
  commandPathOf,
  commandTokens,
  firstCommandWord,
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
import { reportFatal } from "../adapters/inbound/cli/output/fatal.js";

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

// Imports installed plugins only for the commands that need their code, then names the plugin that
// serves this command in the envelope, or fails when that plugin cannot serve it.
async function loadInstalledPlugins(
  runtime: ReturnType<typeof composeCliRuntime>,
  tokens: string[],
): Promise<void> {
  const word = firstCommandWord(tokens);
  const listing =
    commandPathOf(tokens, (path) => path.length === 2 && path.join(" ") === "plugin list") !==
    undefined;
  await runtime.plugins.load(
    { all: tokens.includes("--json-schema") || listing, ...(word === undefined ? {} : { word }) },
    (message) => runtime.streams.diagnostic("warn", message),
  );
  runtime.registerCapabilities();
  const owner = word === undefined ? undefined : runtime.plugins.owner(word);
  if (owner === undefined) return;
  runtime.formatter.attribute({ name: owner.name, version: owner.version });
  if (owner.failure) throw owner.failure;
}

// Callable from tests: never ends the process.
export async function main(argv: string[]): Promise<ExitCode> {
  return (await runCommand(argv)).code;
}

interface CommandEnd {
  code: ExitCode;
  // A server is still listening; the process must not be ended.
  longLived: boolean;
}

/**
 * Runs one command as the whole process: waits until stdout and stderr have accepted everything
 * written, then ends the process unless a server keeps it. A reader that never drains the pipe can
 * delay the end; nothing else outlives the command.
 */
export async function runProcess(
  argv: string[],
  io: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    exit: (code: ExitCode) => void;
  } = { stdout: process.stdout, stderr: process.stderr, exit: (code) => process.exit(code) },
): Promise<void> {
  // A reader that closed the pipe early must not turn into a crash report on top of the result.
  io.stdout.on("error", () => {});
  io.stderr.on("error", () => {});
  let end: CommandEnd;
  const reached: ReachedRuntime = {};
  try {
    end = await runCommand(argv, reached);
  } catch (error) {
    end = { code: reportFatal(error, reached.streams), longLived: false };
  }
  await Promise.all([written(io.stdout), written(io.stderr)]);
  if (end.longLived) process.exitCode = end.code;
  else io.exit(end.code);
}

// Resolves once everything written before it has been handed to the OS, or the stream failed.
function written(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    try {
      stream.write("", () => resolve());
    } catch {
      resolve();
    }
  });
}

// The masked streams, once the runtime is composed; a failure before that has no credentials to mask.
interface ReachedRuntime {
  streams?: Pick<StreamManager, "errorLine">;
}

async function runCommand(argv: string[], reached: ReachedRuntime = {}): Promise<CommandEnd> {
  const monotonicStart = performance.now();
  const startedAt = Date.now();
  setRedactedHomeDirectory(homedir());
  const tokens = commandTokens(argv);
  const { globals, secretPaths, invalid, stdinFlags, intentError } = parseGlobals(tokens);

  // Reject competing stdin secrets before migration or command logic can consume stdin.
  const stdinConflict = stdinConflictError(stdinFlags);
  if (stdinConflict) {
    return { code: reportBootstrapFailure(stdinConflict, globals, startedAt), longLived: false };
  }

  let runtime: ReturnType<typeof composeCliRuntime>;
  try {
    runtime = composeCliRuntime({ globals, secretPaths, startedAt, monotonicStart });
  } catch (error) {
    return { code: reportBootstrapFailure(error, globals, startedAt), longLived: false };
  }
  reached.streams = runtime.streams;
  const end = (code: ExitCode): CommandEnd => ({ code, longLived: runtime.lifetime.longLived });

  try {
    await loadInstalledPlugins(runtime, tokens);
    if (hasMeta(tokens) || !hasCommand(tokens)) {
      const help = new HelpService(
        runtime.registry,
        runtime.streams,
        VERSION,
        runtime.capabilities,
        runtime.errorCodes,
      );
      return end(help.handleMeta(hasMeta(tokens) ? tokens : ["--help"]));
    }

    // Secrets on stdin are read once, asynchronously, so the deadline can stop a stalled pipe.
    // The read precedes dispatch, so a failure here names the command argv gave, if any.
    await runtime.deps.secrets.loadStdin(runtime.deadline.signal).catch((error: unknown) => {
      const path = commandPathOf(
        tokens,
        (p) =>
          runtime.registry.resolveNeutral(p) !== null || runtime.registry.resolveChain(p) !== null,
      );
      if (path) runtime.session.current = { commandId: commandId({ path }) };
      throw error;
    });

    // Migrate before dispatch; public help and discovery bypass this gate. The original command
    // never runs after a cancelled or completed upgrade.
    const migration = await runtime.migrations.run(cliMigrationPrompt(runtime.deps));
    if (renderMigrationOutcome(migration, runtime.streams, runtime.formatter)) return end(0);

    const invalidGlobal = invalidGlobalError(invalid);
    if (invalidGlobal) throw invalidGlobal;
    if (intentError) throw intentError;

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
    return end(0);
  } catch (error) {
    const normalized = normalizeCliError(error);
    if (normalized.code === "internal_error") {
      runtime.streams.diagnostic("debug", `internal error: ${String(error)}`);
    }
    runtime.formatter.error(normalized, {
      commandId: runtime.session.current?.commandId,
      net: runtime.session.current?.net,
    });
    return end(exitCodeOf(normalized, runtime.errorCodes));
  } finally {
    runtime.deps.secrets.clearPrimed();
    runtime.prompter.close();
    runtime.deadline.dispose();
  }
}
