/**
 * Help catalog — the machine-readable half of HelpService: the structured global/stdin flag
 * model and the `--json-schema` command catalog. The human text renderer lives in./index.
 * Single structured source: the flag model is rendered as text in command --help AND emitted as
 * `globalFlags` in the root catalog.
 */
import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { commandId } from "../command-id.js";
import { GLOBAL_FLAG_SPECS, type GlobalFlagSpec } from "../globals/index.js";

// Flags accepted on every command (kubectl-style globals + secret channels). The flag model — arity,
// descriptions, defaults, and the global-vs-command-scoped split — is owned by domain metadata
// GLOBAL_FLAG_SPECS; this layer is the rendered shape (`--flag`/`-alias` tokens) and a pure
// projection over it. GLOBAL_FLAGS = the globally-listed flags; STDIN_FLAGS = the command-scoped ones.
export interface GlobalFlag {
  flag: string;
  alias?: string;
  type: "string" | "number" | "boolean";
  values?: string[];
  description: string;
  optional?: boolean;
  defaultValue?: string | number | boolean;
}

/** spec → rendered GlobalFlag (adds the `--`/`-` token prefixes the help/catalog surface use). */
function globalFlagDoc(f: GlobalFlagSpec): GlobalFlag {
  return {
    flag: `--${f.name}`,
    ...(f.alias ? { alias: `-${f.alias}` } : {}),
    type: f.kind === "value" ? f.valueType! : "boolean",
    ...(f.choices ? { values: [...f.choices] } : {}),
    description: f.description,
    ...(f.defaultValue !== undefined ? { defaultValue: f.defaultValue } : {}),
  };
}

export const GLOBAL_FLAGS: readonly GlobalFlag[] = GLOBAL_FLAG_SPECS.filter((f) => !f.commandScoped).map(globalFlagDoc);

// stdin channel → its documented --*-stdin flag, derived from the command-scoped specs (keyed by secretKey).
const STDIN_FLAGS = Object.fromEntries(
  GLOBAL_FLAG_SPECS.filter((f) => f.commandScoped).map((f) => [f.secretKey, globalFlagDoc(f)]),
) as Record<NonNullable<CommandDefinition["stdin"]>, GlobalFlag>;

export function inputFlagsFor(cmd: CommandDefinition): readonly GlobalFlag[] {
  return cmd.stdin ? [STDIN_FLAGS[cmd.stdin]] : [];
}

/** usage line: the typed path is complete for both kinds (neutral = full, chain = logical). */
export function commandUsage(cmd: CommandDefinition): string {
  return `wallet-cli ${cmd.path.join(" ")} [options]`;
}

/** never let one un-convertible schema break the whole catalog. */
function commandInputSchema(input: CommandDefinition["input"]): unknown {
  try {
    return z.toJSONSchema(input as z.ZodType);
  } catch {
    return { type: "object" };
  }
}

/** machine-readable catalog of the whole command surface — the agent's single discovery call. */
export function buildCatalog(registry: CommandRegistry, version: string, familyFilter?: ChainFamily): string {
  const commands = registry
    .all()
    .filter((c) => !familyFilter || c.family === familyFilter)
    .map((cmd) => ({ cmd, id: commandId(cmd) }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ cmd, id }) => ({
      id,
      kind: cmd.family ? "chain" : "neutral",
      ...(cmd.family ? { family: cmd.family } : {}),
      path: cmd.path,
      usage: commandUsage(cmd),
      summary: cmd.summary ?? "",
      requires: { network: cmd.network, auth: cmd.auth, wallet: cmd.wallet },
      ...(cmd.capability ? { capability: cmd.capability } : {}),
      examples: cmd.examples.map((e) => e.cmd),
      ...(inputFlagsFor(cmd).length ? { inputFlags: inputFlagsFor(cmd) } : {}),
      inputSchema: commandInputSchema(cmd.input),
    }));
  return JSON.stringify({ tool: "wallet-cli", version, globalFlags: GLOBAL_FLAGS, commands });
}
