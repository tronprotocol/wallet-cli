import { hideBin } from "yargs/helpers";
import type { Globals } from "../contracts/index.js";
import { coerceGlobalValue, globalTokenMaps } from "./index.js";
import type { SecretPaths } from "../input/secret/index.js";
import { UsageError } from "../../../../domain/errors/index.js";

const {
  valueFlags: VALUE_FLAGS,
  booleanFlags: BOOLEAN_FLAGS,
  secretStdinFlags: SECRET_STDIN_FLAGS,
} = globalTokenMaps();

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
} {
  const globals = { verbose: false } as Globals;
  const secretPaths: SecretPaths = {};
  const invalid: InvalidGlobal[] = [];
  const stdinFlags: string[] = [];
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

    const booleanField = BOOLEAN_FLAGS[token];
    if (booleanField) (globals as unknown as Record<string, unknown>)[booleanField] = true;
  }
  return { globals, secretPaths, invalid, stdinFlags };
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
