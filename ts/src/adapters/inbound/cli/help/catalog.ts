import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import { isChainCommand } from "../contracts/index.js";
import type {
  ChainCommandDefinition,
  CommandDefinition,
  StdinChannel,
} from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { commandId } from "../command-id.js";
import { GLOBAL_FLAG_SPECS, type GlobalFlagSpec } from "../globals/index.js";
import { ERROR_CODES } from "../../../../domain/errors/codes.js";

export interface GlobalFlag {
  flag: string;
  alias?: string;
  type: "string" | "number" | "boolean";
  values?: string[];
  description: string;
  optional?: boolean;
  defaultValue?: string | number | boolean;
}

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

export const GLOBAL_FLAGS: readonly GlobalFlag[] = GLOBAL_FLAG_SPECS.filter(
  (f) => !f.commandScoped,
).map(globalFlagDoc);

const STDIN_FLAGS = Object.fromEntries(
  GLOBAL_FLAG_SPECS.filter((f) => f.commandScoped).map((f) => [f.secretKey, globalFlagDoc(f)]),
) as Record<NonNullable<CommandDefinition["stdin"]>, GlobalFlag>;

export function inputFlagsFor(cmd: { stdin?: StdinChannel }): readonly GlobalFlag[] {
  return cmd.stdin ? [STDIN_FLAGS[cmd.stdin]] : [];
}

export function commandUsage(cmd: CommandDefinition): string {
  return `wallet-cli ${cmd.path.join(" ")} [options]`;
}

// One unsupported schema must not break the catalog.
function commandInputSchema(input: z.ZodType): unknown {
  try {
    return z.toJSONSchema(input as z.ZodType);
  } catch {
    return { type: "object" };
  }
}

export function buildCatalog(
  registry: CommandRegistry,
  version: string,
  familyFilter?: ChainFamily,
): string {
  const commands = registry
    .all()
    .filter((cmd) =>
      isChainCommand(cmd)
        ? !familyFilter || cmd.families[familyFilter] !== undefined
        : !familyFilter,
    )
    .map((cmd) =>
      isChainCommand(cmd)
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
            ...(cmd.spec.exclusive?.length ? { exclusive: cmd.spec.exclusive } : {}),
            ...(cmd.spec.stdin ? { inputFlags: inputFlagsFor(cmd.spec) } : {}),
            inputSchema: commandInputSchema(mergedInput(cmd, familyFilter)),
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
            ...(cmd.exclusive?.length ? { exclusive: cmd.exclusive } : {}),
            ...(inputFlagsFor(cmd).length ? { inputFlags: inputFlagsFor(cmd) } : {}),
            inputSchema: commandInputSchema(cmd.input),
          },
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    tool: "wallet-cli",
    version,
    globalFlags: GLOBAL_FLAGS,
    errorCodes: ERROR_CODES,
    commands,
  });
}

function mergedInput(def: ChainCommandDefinition, family?: ChainFamily): z.ZodType {
  let shape = { ...def.spec.baseFields.shape };
  const bindings = family ? [def.families[family]] : Object.values(def.families);
  for (const binding of bindings) {
    if (binding?.fields) shape = { ...shape, ...binding.fields.shape };
  }
  let input: z.ZodType = z.object(shape);
  if (def.spec.baseRefine) input = input.superRefine(def.spec.baseRefine);
  for (const binding of bindings) {
    if (binding?.refine) input = input.superRefine(binding.refine);
  }
  return input;
}
