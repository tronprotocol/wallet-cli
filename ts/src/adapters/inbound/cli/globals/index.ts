// Global flag specs also define help display order.
import type { SecretKind } from "../contracts/index.js";
import {
  OUTPUT_MODES,
  MAX_TIMEOUT_MS,
  TIMEOUT_MS_RULE,
  timeoutMsFromText,
  type ValueRule,
} from "../../../../domain/config/index.js";
import { CONFIG_DEFAULTS } from "../../../../application/contracts/config-defaults.js";

export type GlobalFlagKind = "value" | "boolean" | "secret-stdin";

export interface GlobalFlagSpec {
  // Kebab name without leading dashes.
  name: string;
  // Single-character alias without a dash.
  alias?: string;
  kind: GlobalFlagKind;
  // Value flags only.
  valueType?: "string" | "number";
  choices?: readonly string[];
  // Numeric flags without a rule accept any number >= 0.
  rule?: ValueRule<number>;
  // Published in --json-schema; must match the rule.
  bounds?: { minimum: number; maximum: number };
  // Turns argument text into the number the rule checks; defaults to Number.
  fromText?: (text: string) => number;
  // Secret-stdin flags only.
  secretKey?: SecretKind;
  // Overrides the default camelCase runtime field.
  field?: string;
  description: string;
  // Absent means help shows [optional].
  defaultValue?: string | number | boolean;
  // Boolean flags only: --no-<name> sets the field to false; help documents it with this text.
  negation?: string;
  // Document under the owning command instead of in the global flag list.
  commandScoped?: boolean;
}

export const GLOBAL_FLAG_SPECS: readonly GlobalFlagSpec[] = [
  {
    name: "output",
    alias: "o",
    kind: "value",
    valueType: "string",
    choices: OUTPUT_MODES,
    description: "result format",
    defaultValue: `config.defaultOutput (built-in: ${CONFIG_DEFAULTS.defaultOutput})`,
  },
  {
    name: "network",
    kind: "value",
    valueType: "string",
    description:
      "network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted",
  },
  {
    name: "account",
    kind: "value",
    valueType: "string",
    description:
      "accountId, label, or address for wallet-bound commands; an address is only valid on its own chain (use accountId or label to cross chains); read-only commands accept any address of that chain, signing commands require you to hold it; falls back to the active account set by use",
  },
  {
    name: "timeout",
    kind: "value",
    valueType: "number",
    field: "timeoutMs",
    rule: TIMEOUT_MS_RULE,
    bounds: { minimum: 0, maximum: MAX_TIMEOUT_MS },
    fromText: timeoutMsFromText,
    description: `deadline for the whole command, in milliseconds (0-${MAX_TIMEOUT_MS}); 0 = no limit`,
    defaultValue: `config.timeoutMs (built-in: ${CONFIG_DEFAULTS.timeoutMs})`,
  },
  {
    name: "verbose",
    alias: "v",
    kind: "boolean",
    description: "show extra diagnostic output",
    defaultValue: false,
  },
  // Wording must also cover provider-submitted transactions, such as GasFree.
  {
    name: "wait",
    kind: "boolean",
    description:
      "after submitting, wait until the transaction is confirmed or failed, within the command deadline; the default where a transaction is submitted",
    negation: "return the submitted receipt without waiting for confirmation; approvals still wait",
  },
  {
    name: "password-stdin",
    kind: "secret-stdin",
    secretKey: "password",
    description:
      "read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run",
  },
  // Mnemonics, private keys, and new passwords have no stdin flag.
  {
    name: "tx-stdin",
    kind: "secret-stdin",
    secretKey: "tx",
    commandScoped: true,
    description: "read the signed transaction JSON from stdin (fd 0)",
  },
  {
    name: "message-stdin",
    kind: "secret-stdin",
    secretKey: "message",
    commandScoped: true,
    description: "read the message bytes/text from stdin (fd 0)",
  },
  {
    name: "api-key-stdin",
    kind: "secret-stdin",
    secretKey: "apiKey",
    commandScoped: true,
    description:
      "read a credential value from stdin (fd 0); accepted only by config <credential key>, e.g. config baiApiKey --api-key-stdin",
  },
];

export const globalFlagField = (name: string): string =>
  name.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
const specField = (f: GlobalFlagSpec): string => f.field ?? globalFlagField(f.name);

const VALUE_SPEC_BY_FIELD: Record<string, GlobalFlagSpec> = Object.fromEntries(
  GLOBAL_FLAG_SPECS.filter((f) => f.kind === "value").map((f) => [specField(f), f]),
);

export type GlobalCoercion = { ok: true; value: string | number } | { ok: false; reason: string };

// Invalid values return a reason; callers must not silently substitute defaults.
export function coerceGlobalValue(field: string, raw: string): GlobalCoercion {
  const spec = VALUE_SPEC_BY_FIELD[field];
  if (!spec) return { ok: true, value: raw };
  if (spec.valueType === "number") {
    const n = (spec.fromText ?? Number)(raw);
    if (spec.rule) {
      return spec.rule.accepts(n)
        ? { ok: true, value: n }
        : { ok: false, reason: `must be ${spec.rule.description}` };
    }
    return Number.isFinite(n) && n >= 0
      ? { ok: true, value: n }
      : { ok: false, reason: "must be a number >= 0" };
  }
  if (spec.choices) {
    return spec.choices.includes(raw)
      ? { ok: true, value: raw }
      : { ok: false, reason: `must be one of: ${spec.choices.join(", ")}` };
  }
  return { ok: true, value: raw };
}

interface YargsOption {
  type: "string" | "number" | "boolean";
  choices?: readonly string[];
  alias?: string;
}

export function globalYargsOptions(): Record<string, YargsOption> {
  const out: Record<string, YargsOption> = {};
  for (const f of GLOBAL_FLAG_SPECS) {
    const o: YargsOption = { type: f.kind === "value" ? f.valueType! : "boolean" };
    if (f.choices) o.choices = f.choices;
    if (f.alias) o.alias = f.alias;
    out[f.name] = o;
  }
  return out;
}

// Token lookups for scanning argv before yargs.
export interface GlobalTokenMaps {
  // Flag token (--long or -alias) to runtime field.
  valueFlags: Record<string, string>;
  booleanFlags: Record<string, string>;
  // --no-<name> to runtime field, set to false.
  negatedFlags: Record<string, string>;
  // --<kind>-stdin to secret kind; stdin uses fd 0.
  secretStdinFlags: Record<string, SecretKind>;
}

export function globalTokenMaps(): GlobalTokenMaps {
  const valueFlags: Record<string, string> = {};
  const booleanFlags: Record<string, string> = {};
  const negatedFlags: Record<string, string> = {};
  const secretStdinFlags: Record<string, SecretKind> = {};
  for (const f of GLOBAL_FLAG_SPECS) {
    const tokens = f.alias ? [`--${f.name}`, `-${f.alias}`] : [`--${f.name}`];
    if (f.kind === "value") for (const t of tokens) valueFlags[t] = specField(f);
    else if (f.kind === "boolean") {
      for (const t of tokens) booleanFlags[t] = specField(f);
      if (f.negation !== undefined) negatedFlags[`--no-${f.name}`] = specField(f);
    } else secretStdinFlags[`--${f.name}`] = f.secretKey!;
  }
  return { valueFlags, booleanFlags, negatedFlags, secretStdinFlags };
}
