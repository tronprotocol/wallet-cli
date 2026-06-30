import type { Globals } from "../adapters/inbound/cli/contracts/index.js";
import {
  coerceGlobalValue,
  globalTokenMaps,
} from "../adapters/inbound/cli/globals/index.js";
import type { SecretPaths } from "../adapters/inbound/cli/input/secret/index.js";

const {
  valueFlags: VALUE_FLAGS,
  booleanFlags: BOOLEAN_FLAGS,
  secretStdinFlags: SECRET_STDIN_FLAGS,
} = globalTokenMaps();

/** Pre-yargs scan needed to select output and secret channels before the CLI adapter is built. */
export function parseGlobals(tokens: string[]): { globals: Globals; secretPaths: SecretPaths } {
  const globals = { verbose: false } as Globals;
  const secretPaths: SecretPaths = {};
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
        (globals as unknown as Record<string, unknown>)[valueKey] = coerceGlobalValue(valueKey, value);
      }
      continue;
    }

    const stdinKind = SECRET_STDIN_FLAGS[token];
    if (stdinKind) {
      secretPaths[stdinKind] = "-";
      continue;
    }

    const booleanField = BOOLEAN_FLAGS[token];
    if (booleanField) (globals as unknown as Record<string, unknown>)[booleanField] = true;
  }
  return { globals, secretPaths };
}

/** True when argv contains a command token rather than only global flags and their values. */
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
