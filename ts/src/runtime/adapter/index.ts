/**
 * ZodYargsAdapter (L2) — derive the minimal arity hints yargs needs from a command's
 * zod `fields` (boolean→switch, else takes a value). Validation/types/defaults/cross-field
 * checks stay in zod only — single source of truth (plan §3 L2 / 修正①). [replaces FlagSpecRegistry]
 */
import type { Argv } from "yargs";
import type { ZodObject, ZodRawShape, ZodType } from "zod";

export interface FieldInfo {
  name: string;
  kebab: string;
  baseType: string;
  optional: boolean;
  hasDefault: boolean;
  description?: string;
}

export function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function unwrap(schema: ZodType): { base: ZodType; optional: boolean; hasDefault: boolean; description?: string } {
  let s: any = schema;
  let optional = false;
  let hasDefault = false;
  let description: string | undefined = s?.description;
  while (s?.def && (s.def.type === "optional" || s.def.type === "default" || s.def.type === "nullable")) {
    if (s.def.type === "optional" || s.def.type === "nullable") optional = true;
    if (s.def.type === "default") hasDefault = true;
    description ??= s.description;
    s = s.def.innerType;
  }
  description ??= s?.description;
  return { base: s, optional, hasDefault, description };
}

export function introspectFields(fields: ZodObject<ZodRawShape>): FieldInfo[] {
  const shape = fields.shape;
  return Object.entries(shape).map(([name, schema]) => {
    const { base, optional, hasDefault, description } = unwrap(schema as ZodType);
    return {
      name,
      kebab: camelToKebab(name),
      baseType: (base as any)?.def?.type ?? "unknown",
      optional,
      hasDefault,
      description,
    };
  });
}

/** literal options of an enum field (after unwrapping optional/default), else undefined. */
export function enumOptions(schema: ZodType): string[] | undefined {
  const { base } = unwrap(schema as ZodType);
  const def = (base as unknown as { def?: { type?: string; entries?: Record<string, string> } }).def;
  if (def?.type !== "enum" || !def.entries) return undefined;
  return Object.values(def.entries);
}

export class ZodYargsAdapter {
  static applyArity(y: Argv, fields: ZodObject<ZodRawShape>): Argv {
    for (const f of introspectFields(fields)) {
      y.option(f.kebab, {
        type: f.baseType === "boolean" ? "boolean" : "string",
        describe: f.description,
        demandOption: false, // requiredness is enforced by zod, not yargs
      });
    }
    return y;
  }

  /** union the arity hints of every command in a namespace group (single source = zod). */
  static applyCommands(y: Argv, fields: ZodObject<ZodRawShape>[]): Argv {
    for (const f of fields) ZodYargsAdapter.applyArity(y, f);
    return y;
  }
}
