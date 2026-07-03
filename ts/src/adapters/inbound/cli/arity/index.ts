/**
 * Arity adapter — derive the minimal arity hints yargs needs from a command's zod `fields`
 * (boolean→switch, else takes a value). Validation/types/defaults/cross-field checks stay in
 * zod only — single source of truth. [replaces FlagSpecRegistry]
 */
import type { Argv } from "yargs";
import { z, type ZodObject, type ZodRawShape, type ZodType } from "zod";

// ── account-ref brand ─────────────────────────────────────────────────────────
// A `string` field that names an existing account (accountId/label/address). Branded so the
// TTY gap-fill can offer an arrow-select of existing accounts instead of free text. The brand
// lives on the FINAL schema instance (zod methods clone), so accountRef applies min+describe
// itself and must be the terminal call — no further chaining.
const ACCOUNT_REF = new WeakSet<object>();
export function accountRef(describe: string): ZodType {
  const s = z.string().min(1).describe(describe);
  ACCOUNT_REF.add(s);
  return s;
}
export function isAccountRef(schema: unknown): boolean {
  return typeof schema === "object" && schema !== null && ACCOUNT_REF.has(schema);
}

// ── case-insensitive enum ──────────────────────────────────────────────────────
// TRON brands its resources/networks in canonical case (ENERGY/BANDWIDTH, Nile, TRON), so an
// exact-match z.enum rejects the casing users most naturally type. ciEnum lower-cases the input
// before matching; `values` must therefore be the lowercase literals. --help still shows those
// literals — enumOptions() descends the preprocess pipe to find them.
export function ciEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(values));
}

export interface FieldInfo {
  name: string;
  kebab: string;
  baseType: string;
  optional: boolean;
  hasDefault: boolean;
  /** the default value (when hasDefault) — surfaced verbatim in --help. */
  defaultValue?: unknown;
  /** literal options when the field is an enum — surfaced as `<a|b>` in --help. */
  choices?: string[];
  description?: string;
}

export function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function unwrap(schema: ZodType): { base: ZodType; optional: boolean; hasDefault: boolean; defaultValue?: unknown; description?: string } {
  let s: any = schema;
  let optional = false;
  let hasDefault = false;
  let defaultValue: unknown;
  let description: string | undefined = s?.description;
  while (s?.def && (s.def.type === "optional" || s.def.type === "default" || s.def.type === "nullable")) {
    if (s.def.type === "optional" || s.def.type === "nullable") optional = true;
    if (s.def.type === "default") {
      hasDefault = true;
      defaultValue = s.def.defaultValue; // zod v4: plain value
    }
    description ??= s.description;
    s = s.def.innerType;
  }
  description ??= s?.description;
  return { base: s, optional, hasDefault, defaultValue, description };
}

export function introspectFields(fields: ZodObject<ZodRawShape>): FieldInfo[] {
  const shape = fields.shape;
  return Object.entries(shape).map(([name, schema]) => {
    const { base, optional, hasDefault, defaultValue, description } = unwrap(schema as ZodType);
    return {
      name,
      kebab: camelToKebab(name),
      baseType: (base as any)?.def?.type ?? "unknown",
      optional,
      hasDefault,
      defaultValue,
      choices: enumOptions(schema as ZodType),
      description,
    };
  });
}

/** literal options of an enum field (after unwrapping optional/default), else undefined. */
export function enumOptions(schema: ZodType): string[] | undefined {
  const { base } = unwrap(schema as ZodType);
  let def = (base as unknown as { def?: { type?: string; entries?: Record<string, string>; out?: { def?: any } } }).def;
  // ciEnum() wraps the enum in a preprocess pipe; the literals live on the pipe's output side.
  if (def?.type === "pipe") def = def.out?.def;
  if (def?.type !== "enum" || !def.entries) return undefined;
  return Object.values(def.entries);
}

/** apply one command's zod fields as yargs options (arity only; requiredness stays in zod). */
function applyArity(y: Argv, fields: ZodObject<ZodRawShape>): Argv {
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
export function applyCommands(y: Argv, fields: ZodObject<ZodRawShape>[]): Argv {
  for (const f of fields) applyArity(y, f);
  return y;
}
