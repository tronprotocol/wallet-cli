// Derive yargs arity from Zod; validation stays in Zod.
import type { Argv } from "yargs";
import { z, type ZodObject, type ZodRawShape, type ZodType } from "zod";

// Do not chain after accountRef: Zod clones lose the brand used by the account picker.
const ACCOUNT_REF = new WeakSet<object>();
export function accountRef(describe: string, opts: { optional?: boolean } = {}): ZodType {
  const base = z.string().min(1).describe(describe);
  const s = opts.optional ? base.optional() : base;
  ACCOUNT_REF.add(s);
  return s;
}
export function isAccountRef(schema: unknown): boolean {
  return typeof schema === "object" && schema !== null && ACCOUNT_REF.has(schema);
}

// Supply lowercase literals; input is lowercased before matching.
export function ciEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(values));
}

export interface FieldInfo {
  name: string;
  kebab: string;
  baseType: string;
  // Repeated flags collect array elements.
  isArray: boolean;
  optional: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  choices?: string[];
  description?: string;
}

export function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function unwrap(schema: ZodType): {
  base: ZodType;
  optional: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  description?: string;
} {
  let s: any = schema;
  let optional = false;
  let hasDefault = false;
  let defaultValue: unknown;
  let description: string | undefined = s?.description;
  while (
    s?.def &&
    (s.def.type === "optional" || s.def.type === "default" || s.def.type === "nullable")
  ) {
    if (s.def.type === "optional" || s.def.type === "nullable") optional = true;
    if (s.def.type === "default") {
      hasDefault = true;
      defaultValue = s.def.defaultValue;
    }
    description ??= s.description;
    s = s.def.innerType;
  }
  description ??= s?.description;
  return { base: s, optional, hasDefault, defaultValue, description };
}

// Help shows the value type, not the pipe or array wrapper.
function displayBaseType(base: ZodType): string {
  let def: any = (base as any)?.def;
  if (def?.type === "pipe") def = def.out?.def;
  if (def?.type === "array") def = def.element?.def;
  return def?.type ?? "unknown";
}

function isArrayField(base: ZodType): boolean {
  let def: any = (base as any)?.def;
  if (def?.type === "pipe") def = def.out?.def;
  return def?.type === "array";
}

export function introspectFields(fields: ZodObject<ZodRawShape>): FieldInfo[] {
  const shape = fields.shape;
  return Object.entries(shape).map(([name, schema]) => {
    const { base, optional, hasDefault, defaultValue, description } = unwrap(schema as ZodType);
    return {
      name,
      kebab: camelToKebab(name),
      baseType: displayBaseType(base),
      isArray: isArrayField(base),
      optional,
      hasDefault,
      defaultValue,
      choices: enumOptions(schema as ZodType),
      description,
    };
  });
}

export function enumOptions(schema: ZodType): string[] | undefined {
  const { base } = unwrap(schema as ZodType);
  let def = (
    base as unknown as {
      def?: { type?: string; entries?: Record<string, string>; out?: { def?: any } };
    }
  ).def;
  // Preprocessed enums store their literals on the output schema.
  if (def?.type === "pipe") def = def.out?.def;
  if (def?.type !== "enum" || !def.entries) return undefined;
  return Object.values(def.entries);
}

function applyArity(y: Argv, fields: ZodObject<ZodRawShape>): Argv {
  for (const f of introspectFields(fields)) {
    y.option(f.kebab, {
      type: f.baseType === "boolean" ? "boolean" : "string",
      ...(f.kebab === "body-file" ? { nargs: 1 } : {}),
      ...(f.isArray ? { array: true } : {}),
      describe: f.description,
      demandOption: false, // Zod enforces required fields.
    });
  }
  return y;
}

export function applyCommands(y: Argv, fields: ZodObject<ZodRawShape>[]): Argv {
  for (const f of fields) applyArity(y, f);
  return y;
}
