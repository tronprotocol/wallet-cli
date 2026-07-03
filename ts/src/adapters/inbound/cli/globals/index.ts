/**
 * Single source of truth for GLOBAL (kubectl-style) flags — the flag list, arity (kinds, aliases,
 * yargs scalar types, choices), per-flag COERCION, and the DOCUMENTATION facts. Everything that
 * otherwise drifts across a flag's touch-points derives from GLOBAL_FLAG_SPECS:
 *   - bootstrap/runner's pre-yargs scan (token maps via globalTokenMaps + coerceGlobalValue),
 *   - cli/shell's yargs `.options()` declaration (globalYargsOptions), and
 *   - cli/help/catalog's documentation projection (globalFlagDoc over description/defaultValue).
 * Add a global flag HERE only; every layer is a projection.
 *
 * Array order is the documented display order (it's what cli/help renders). Other projections are
 * order-independent.
 */
import type { SecretKind } from "../contracts/index.js";

export type GlobalFlagKind = "value" | "boolean" | "secret-stdin";

export interface GlobalFlagSpec {
  /** kebab flag name, no leading dashes (e.g. "wait-timeout", "password-stdin"). */
  name: string;
  /** single-char alias, no dash (e.g. "o", "v"). */
  alias?: string;
  kind: GlobalFlagKind;
  /** value flags only: yargs scalar type. */
  valueType?: "string" | "number";
  /** value flags only: restrict accepted values (yargs `choices`). */
  choices?: readonly string[];
  /** number flags only: minimum accepted value (inclusive). Defaults to 0. */
  min?: number;
  /** secret-stdin flags only: which secret kind this `--<name>` binds. */
  secretKey?: SecretKind;
  /** override the derived camelCase field name when the runtime Globals key differs from the flag
   *  (e.g. `--timeout` → `timeoutMs`); defaults to globalFlagField(name). */
  field?: string;
  /** human-readable flag description (cli/help text + --json-schema catalog). */
  description: string;
  /** documented default; absent → rendered as plain "[optional]". */
  defaultValue?: string | number | boolean;
  /** secret-stdin only: documented under each owning command, not in the global flag list. */
  commandScoped?: boolean;
}

export const GLOBAL_FLAG_SPECS: readonly GlobalFlagSpec[] = [
  { name: "output", alias: "o", kind: "value", valueType: "string", choices: ["text", "json"],
    description: "result format", defaultValue: "config.defaultOutput (built-in: text)" },
  { name: "network", kind: "value", valueType: "string",
    description: "canonical network id, e.g. tron:mainnet, tron:nile, tron:shasta; chain commands fall back to config.defaultNetwork when omitted" },
  { name: "account", kind: "value", valueType: "string",
    description: "accountId, label, or address for wallet-bound commands; falls back to the active account set by use" },
  { name: "timeout", kind: "value", valueType: "number", field: "timeoutMs", min: 1,
    description: "per RPC/device call timeout, in milliseconds", defaultValue: "config.timeoutMs (built-in: 60000)" },
  { name: "verbose", alias: "v", kind: "boolean",
    description: "show extra diagnostic output", defaultValue: false },
  { name: "wait", kind: "boolean",
    description: "after broadcast, poll until the tx is confirmed/failed before returning; default returns the submitted txid without blocking", defaultValue: false },
  { name: "wait-timeout", kind: "value", valueType: "number", field: "waitTimeoutMs",
    description: "--wait polling cap, in milliseconds; on timeout return the submitted receipt", defaultValue: 60000 },
  { name: "password-stdin", kind: "secret-stdin", secretKey: "password",
    description: "read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run" },
  { name: "private-key-stdin", kind: "secret-stdin", secretKey: "privateKey", commandScoped: true,
    description: "read the private key from stdin (fd 0)" },
  { name: "mnemonic-stdin", kind: "secret-stdin", secretKey: "mnemonic", commandScoped: true,
    description: "read the BIP39 mnemonic from stdin (fd 0)" },
  { name: "tx-stdin", kind: "secret-stdin", secretKey: "tx", commandScoped: true,
    description: "read the signed transaction JSON from stdin (fd 0)" },
  { name: "message-stdin", kind: "secret-stdin", secretKey: "message", commandScoped: true,
    description: "read the message bytes/text from stdin (fd 0)" },
];

/** kebab → camel default; the `field` override wins when the runtime Globals key differs from the flag. */
export const globalFlagField = (name: string): string => name.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
const specField = (f: GlobalFlagSpec): string => f.field ?? globalFlagField(f.name);

/** value-flag spec keyed by its runtime Globals field, for coercion. */
const VALUE_SPEC_BY_FIELD: Record<string, GlobalFlagSpec> = Object.fromEntries(
  GLOBAL_FLAG_SPECS.filter((f) => f.kind === "value").map((f) => [specField(f), f]),
);

/**
 * Coerce a raw value-flag string per its spec; `undefined` = invalid (caller falls back to default).
 * Derives entirely from valueType/choices: number flags accept a finite value at or above the spec's
 * `min` (default 0; --timeout sets min 1 since a 0ms bound aborts instantly), choice flags must match,
 * everything else passes through as a string.
 */
export function coerceGlobalValue(field: string, raw: string): string | number | undefined {
  const spec = VALUE_SPEC_BY_FIELD[field];
  if (!spec) return raw;
  if (spec.valueType === "number") {
    const n = Number(raw);
    return Number.isFinite(n) && n >= (spec.min ?? 0) ? n : undefined;
  }
  if (spec.choices) return spec.choices.includes(raw) ? raw : undefined;
  return raw;
}

interface YargsOption {
  type: "string" | "number" | "boolean";
  choices?: readonly string[];
  alias?: string;
}

/** yargs `.options()` shape, keyed by kebab flag name. secret-stdin + boolean flags are presence flags. */
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

/** Token-keyed lookup maps for the pre-yargs scan (bootstrap/runner). Sibling projection to
 *  globalYargsOptions — the other layer that derives from GLOBAL_FLAG_SPECS. */
export interface GlobalTokenMaps {
  /** flag token (`--long` or `-alias`) → runtime Globals field. */
  valueFlags: Record<string, string>;
  booleanFlags: Record<string, string>;
  /** `--<kind>-stdin` → secret kind (the only stdin source is fd 0). */
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
