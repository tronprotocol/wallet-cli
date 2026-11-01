import { hideBin } from "yargs/helpers";
import type { Globals } from "../contracts/index.js";
import { coerceGlobalValue, globalTokenMaps } from "./index.js";
import type { SecretPaths } from "../input/secret/index.js";
import { UsageError } from "../../../../domain/errors/index.js";

const {
  valueFlags: VALUE_FLAGS,
  booleanFlags: BOOLEAN_FLAGS,
  negatedFlags: NEGATED_FLAGS,
  secretStdinFlags: SECRET_STDIN_FLAGS,
} = globalTokenMaps();

const NEGATABLE_FIELDS = new Set(Object.values(NEGATED_FLAGS));

export interface InvalidGlobal {
  flag: string;
  value: string;
  reason: string;
}

// The tokens after the node binary and script path.
export function commandTokens(argv: string[]): string[] {
  return hideBin(argv);
}

// Select output and secret channels before constructing the CLI adapter.
export function parseGlobals(tokens: string[]): {
  globals: Globals;
  secretPaths: SecretPaths;
  invalid: InvalidGlobal[];
  // Distinct secret flags in argv order; stdin can supply only one secret per run.
  stdinFlags: string[];
  // The first misuse of a flag that has a --no- form: a value, or both forms together.
  intentError?: UsageError;
} {
  const globals = { verbose: false } as Globals;
  const secretPaths: SecretPaths = {};
  const invalid: InvalidGlobal[] = [];
  const stdinFlags: string[] = [];
  let intentError: UsageError | undefined;
  const intentSeen = new Map<string, string>();
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i]!;
    let inlineValue: string | undefined;
    const equals = token.indexOf("=");
    if (token.startsWith("--") && equals !== -1) {
      inlineValue = token.slice(equals + 1);
      token = token.slice(0, equals);
    }

    const valueKey = VALUE_FLAGS[token];
    if (valueKey) {
      const value = inlineValue ?? tokens[++i];
      if (value !== undefined) {
        const coerced = coerceGlobalValue(valueKey, value);
        if (coerced.ok) (globals as unknown as Record<string, unknown>)[valueKey] = coerced.value;
        else invalid.push({ flag: token, value, reason: coerced.reason });
      }
      continue;
    }

    const stdinKind = SECRET_STDIN_FLAGS[token];
    if (stdinKind) {
      if (secretPaths[stdinKind] === undefined) stdinFlags.push(token);
      secretPaths[stdinKind] = "-";
      continue;
    }

    const negatedField = NEGATED_FLAGS[token];
    const booleanField = BOOLEAN_FLAGS[token];
    const intentField =
      negatedField ??
      (booleanField && NEGATABLE_FIELDS.has(booleanField) ? booleanField : undefined);
    if (intentField) {
      // yargs reads `--flag=<v>` and a following true/false as a value; only the bare forms are accepted.
      const next = tokens[i + 1];
      const value = inlineValue ?? (next === "true" || next === "false" ? next : undefined);
      const previous = intentSeen.get(intentField);
      if (value !== undefined) {
        intentError ??= new UsageError(
          "invalid_option",
          `${token} takes no value ("${value}"); pass ${token} alone`,
        );
      } else if (previous !== undefined && previous !== token) {
        intentError ??= new UsageError(
          "invalid_option",
          `${previous} and ${token} cannot be combined; pass one of them`,
        );
      }
      intentSeen.set(intentField, token);
      (globals as unknown as Record<string, unknown>)[intentField] = negatedField === undefined;
      continue;
    }
    if (booleanField) (globals as unknown as Record<string, unknown>)[booleanField] = true;
  }
  return { globals, secretPaths, invalid, stdinFlags, ...(intentError ? { intentError } : {}) };
}

export function hasCommand(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.startsWith("-")) {
      if (VALUE_FLAGS[token] && !token.includes("=")) i++;
      continue;
    }
    return true;
  }
  return false;
}

export function stdinConflictError(stdinFlags: string[]): UsageError | undefined {
  if (stdinFlags.length <= 1) return undefined;
  return new UsageError(
    "invalid_option",
    `${stdinFlags.join(" and ")} cannot be combined: only one secret may be read from stdin per run`,
  );
}

export function invalidGlobalError(invalid: InvalidGlobal[]): UsageError | undefined {
  const bad = invalid[0];
  if (bad === undefined) return undefined;
  return new UsageError("invalid_value", `invalid ${bad.flag} value "${bad.value}": ${bad.reason}`);
}

// The longest command path named by the leading words of argv, skipping global flags; undefined when
// argv names no registered command. Command flags end the search.
export function commandPathOf(
  tokens: string[],
  isCommand: (path: string[]) => boolean,
): string[] | undefined {
  const words: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!token.startsWith("-")) {
      words.push(token);
      continue;
    }
    const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (VALUE_FLAGS[flag]) {
      if (!token.includes("=")) i++;
      continue;
    }
    if (SECRET_STDIN_FLAGS[flag] || BOOLEAN_FLAGS[flag] || NEGATED_FLAGS[flag]) continue;
    break;
  }
  for (let length = words.length; length > 0; length--) {
    const path = words.slice(0, length);
    if (isCommand(path)) return path;
  }
  return undefined;
}
