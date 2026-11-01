import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import { isChainCommand } from "../contracts/index.js";
import type {
  ChainCommandDefinition,
  CommandDefinition,
  ExclusiveGroup,
  StdinChannel,
} from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import type { CapabilityRegistry } from "../../../../application/services/capability/index.js";
import { commandId } from "../command-id.js";
import { GLOBAL_FLAG_SPECS, type GlobalFlagSpec } from "../globals/index.js";
import { ERROR_CODES } from "../../../../domain/errors/codes.js";
import { exclusiveGroupsFor, exclusiveRefine } from "../schemas/exclusive.js";

export interface GlobalFlag {
  flag: string;
  alias?: string;
  type: "string" | "number" | "boolean";
  values?: string[];
  minimum?: number;
  maximum?: number;
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
    ...(f.bounds ? { minimum: f.bounds.minimum, maximum: f.bounds.maximum } : {}),
    description: f.description,
    ...(f.defaultValue !== undefined ? { defaultValue: f.defaultValue } : {}),
  };
}

export const GLOBAL_FLAGS: readonly GlobalFlag[] = GLOBAL_FLAG_SPECS.filter(
  (f) => !f.commandScoped,
).flatMap((f) =>
  f.negation === undefined
    ? [globalFlagDoc(f)]
    : [
        globalFlagDoc(f),
        { flag: `--no-${f.name}`, type: "boolean" as const, description: f.negation },
      ],
);

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

// Per-network support of each capability, from the capability predicates.
export type CapabilitySupportSource = Pick<CapabilityRegistry, "supportByNetwork">;

export function buildCatalog(
  registry: CommandRegistry,
  version: string,
  familyFilter?: ChainFamily,
  capabilities?: CapabilitySupportSource,
): string {
  const support = (capability: string | undefined, families: readonly string[]) =>
    capability && capabilities
      ? {
          support: Object.fromEntries(
            capabilities
              .supportByNetwork(capability)
              .filter((n) => families.includes(n.family))
              .map((n) => [n.network, n.support]),
          ),
        }
      : {};
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
            ...support(
              cmd.spec.capability,
              familyFilter ? [familyFilter] : Object.keys(cmd.families),
            ),
            examples: cmd.spec.examples.map((e: { cmd: string }) => e.cmd),
            ...exclusiveEntry(
              exclusiveGroupsFor(cmd.spec.exclusive, mergedFields(cmd, familyFilter)),
            ),
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
            ...support(cmd.capability, familyFilter ? [familyFilter] : registry.families()),
            examples: cmd.examples.map((e: { cmd: string }) => e.cmd),
            ...exclusiveEntry(exclusiveGroupsFor(cmd.exclusive, cmd.fields)),
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

function exclusiveEntry(groups: ExclusiveGroup[]): { exclusive?: ExclusiveGroup[] } {
  return groups.length ? { exclusive: groups } : {};
}

// A shared field is required only when every family requires it.
export function mergedFields(
  def: ChainCommandDefinition,
  family?: ChainFamily,
): z.ZodObject<z.ZodRawShape> {
  const shapes = bindingsFor(def, family).map((binding): z.ZodRawShape => ({
    ...def.spec.baseFields.shape,
    ...binding?.fields?.shape,
  }));
  const shape: Record<string, z.ZodRawShape[string]> = Object.assign({}, ...shapes);
  const acceptsAbsent = (field: z.ZodRawShape[string] | undefined) =>
    field !== undefined && z.safeParse(field, undefined).success;
  for (const [name, field] of Object.entries(shape)) {
    if (!acceptsAbsent(field) && shapes.some((s) => acceptsAbsent(s[name]))) {
      shape[name] = z.optional(field);
    }
  }
  return z.object(shape);
}

function bindingsFor(def: ChainCommandDefinition, family?: ChainFamily) {
  return family ? [def.families[family]] : Object.values(def.families);
}

function mergedInput(def: ChainCommandDefinition, family?: ChainFamily): z.ZodType {
  const fields = mergedFields(def, family);
  let input: z.ZodType = fields;
  const exclusive = exclusiveRefine(def.spec.exclusive, fields);
  if (exclusive) input = input.superRefine(exclusive);
  if (def.spec.baseRefine) input = input.superRefine(def.spec.baseRefine);
  for (const binding of bindingsFor(def, family)) {
    if (binding?.refine) input = input.superRefine(binding.refine);
  }
  return input;
}
