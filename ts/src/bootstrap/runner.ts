import { hideBin } from "yargs/helpers";
import type { ExitCode } from "../domain/types/index.js";
import { normalizeError } from "../domain/errors/index.js";
import { HelpService, hasMeta } from "../adapters/inbound/cli/help/index.js";
import { buildCli } from "../adapters/inbound/cli/shell/index.js";
import { hasCommand, parseGlobals } from "./argv.js";
import { composeCliRuntime } from "./composition.js";

export const VERSION = "0.1.1";

/** Execute one CLI invocation. Dependency construction is delegated to the composition root. */
export async function main(argv: string[]): Promise<ExitCode> {
  const startedAt = Date.now();
  const tokens = hideBin(argv);
  const { globals, secretPaths } = parseGlobals(tokens);
  const runtime = composeCliRuntime({ globals, secretPaths, startedAt });

  try {
    if (hasMeta(tokens) || !hasCommand(tokens)) {
      const help = new HelpService(runtime.registry, runtime.streams, VERSION);
      return help.handleMeta(hasMeta(tokens) ? tokens : ["--help"]);
    }

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
    runtime.prompter.close();
  }
}
