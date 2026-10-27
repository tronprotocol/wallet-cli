// Global flag specs also define help display order.
import type { SecretKind } from "../contracts/index.js";

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
  // Inclusive minimum for numeric flags; defaults to zero.
  min?: number;
  // Secret-stdin flags only.
  secretKey?: SecretKind;
  // Overrides the default camelCase runtime field.
  field?: string;
  description: string;
  // Absent means help shows [optional].
  defaultValue?: string | number | boolean;
  // Document under the owning command instead of in the global flag list.
  commandScoped?: boolean;
}

export const GLOBAL_FLAG_SPECS: readonly GlobalFlagSpec[] = [
  {
    name: "output",
    alias: "o",
    kind: "value",
    valueType: "string",
    choices: ["text", "json"],
    description: "result format",
    defaultValue: "config.defaultOutput (built-in: text)",
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
    min: 1,
    description: "per node, service, or device call timeout, in milliseconds",
    defaultValue: "config.timeoutMs (built-in: 60000)",
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
      "after submitting, poll until the transaction is confirmed/failed before returning; default returns the submitted receipt without blocking",
    defaultValue: false,
  },
  {
    name: "wait-timeout",
    kind: "value",
    valueType: "number",
    field: "waitTimeoutMs",
    description: "--wait polling cap, in milliseconds; on timeout return the submitted receipt",
    defaultValue: "config.waitTimeoutMs (built-in: 60000)",
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
    description: "read the B.AI API key from stdin (fd 0); accepted only by config baiApiKey",
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
    const n = Number(raw);
    const min = spec.min ?? 0;
    return Number.isFinite(n) && n >= min
      ? { ok: true, value: n }
      : { ok: false, reason: `must be a number >= ${min}` };
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
  // --<kind>-stdin to secret kind; stdin uses fd 0.
  secretStdinFlags: Record<string, SecretKind>;
}

export function globalTokenMaps(): GlobalTokenMaps {
  const valueFlags: Record<string, string> = {};
  const booleanFlags: Record<string, string> = {};
  const secretStdinFlags: Record<string, SecretKind> = {};
  for (const f of GLOBAL_FLAG_SPECS) {
    const tokens = f.alias ? [`--${f.name}`, `-${f.alias}`] : [`--${f.name}`];
    if (f.kind === "value") for (const t of tokens) valueFlags[t] = specField(f);
    else if (f.kind === "boolean") for (const t of tokens) booleanFlags[t] = specField(f);
    else secretStdinFlags[`--${f.name}`] = f.secretKey!;
  }
  return { valueFlags, booleanFlags, secretStdinFlags };
}
