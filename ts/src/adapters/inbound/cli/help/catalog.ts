/**
 * Help catalog — the machine-readable half of HelpService: the structured global/stdin flag
 * model and the `--json-schema` command catalog. The human text renderer lives in./index.
 * Single structured source: the flag model is rendered as text in command --help AND emitted as
 * `globalFlags` in the root catalog.
 */
import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import { isChainCommand } from "../contracts/index.js";
import type { ChainCommandDefinition, CommandDefinition, StdinChannel } from "../contracts/index.js";
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

export function inputFlagsFor(cmd: { stdin?: StdinChannel }): readonly GlobalFlag[] {
  return cmd.stdin ? [STDIN_FLAGS[cmd.stdin]] : [];
}

/** usage line: the typed path is complete for both kinds (neutral = full, chain = logical). */
export function commandUsage(cmd: CommandDefinition): string {
  return `wallet-cli ${cmd.path.join(" ")} [options]`;
}

/** never let one un-convertible schema break the whole catalog. */
function commandInputSchema(input: z.ZodType): unknown {
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
    .filter((cmd) => isChainCommand(cmd)
      ? !familyFilter || cmd.families[familyFilter] !== undefined
      : !familyFilter)
    .map((cmd) => isChainCommand(cmd)
      ? {
          id: commandId({ path: cmd.spec.path }),
          kind: "chain",
          families: Object.keys(cmd.families),
          path: cmd.spec.path,
          usage: `wallet-cli ${cmd.spec.path.join(" ")} [options]`,
          summary: cmd.spec.summary ?? "",
          requires: { network: cmd.spec.network, auth: cmd.spec.auth, wallet: cmd.spec.wallet },
          ...(cmd.spec.capability ? { capability: cmd.spec.capability } : {}),
          examples: cmd.spec.examples.map((e: { cmd: string }) => e.cmd),
          ...(cmd.spec.stdin ? { inputFlags: inputFlagsFor(cmd.spec) } : {}),
          inputSchema: commandInputSchema(mergedInput(cmd)),
        }
      : {
          id: commandId(cmd),
          kind: "neutral",
          path: cmd.path,
          usage: commandUsage(cmd),
          summary: cmd.summary ?? "",
          requires: { network: cmd.network, auth: cmd.auth, wallet: cmd.wallet },
          ...(cmd.capability ? { capability: cmd.capability } : {}),
          examples: cmd.examples.map((e: { cmd: string }) => e.cmd),
          ...(inputFlagsFor(cmd).length ? { inputFlags: inputFlagsFor(cmd) } : {}),
          inputSchema: commandInputSchema(cmd.input),
        })
    .sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify({ tool: "wallet-cli", version, globalFlags: GLOBAL_FLAGS, commands });
}

function mergedInput(def: ChainCommandDefinition): z.ZodType {
  let shape = { ...def.spec.baseFields.shape };
  for (const binding of Object.values(def.families)) {
    if (binding?.fields) shape = { ...shape, ...binding.fields.shape };
  }
  let input: z.ZodType = z.object(shape);
  if (def.spec.baseRefine) input = input.superRefine(def.spec.baseRefine);
  for (const binding of Object.values(def.families)) {
    if (binding?.refine) input = input.superRefine(binding.refine);
  }
  return input;
}
