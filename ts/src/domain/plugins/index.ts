// Plugin packages: the manifest a package declares, API compatibility, and install sources.
import { ExecutionError, UsageError } from "../errors/index.js";
import type { ChainFamily } from "../family/chain-family.js";
import type { JsonValue } from "../types/network.js";

// The plugin API this wallet-cli provides; a plugin built for another version is not loaded.
export const PLUGIN_API_VERSION = 1;
export const PLUGIN_API_REVISION = 1;

// Plugin names and command group words; a name is also the install directory name.
export const PLUGIN_WORD = /^[a-z0-9][a-z0-9-]{0,63}$/;

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const FAMILIES: readonly ChainFamily[] = ["tron", "evm"];
const MAX_TEXT = 2000;

export interface PluginGroupManifest {
  readonly name: string;
  readonly summary: string;
  readonly description?: string;
  readonly families: readonly ChainFamily[];
}

// `walletCli.plugin` of the package's package.json, with the package version.
export interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  readonly apiRevision: number;
  // Relative to the package root.
  readonly entry: string;
  readonly groups: readonly PluginGroupManifest[];
}

export type PluginSourceRecord =
  | { readonly type: "registry"; readonly spec: string; readonly registry: string }
  | { readonly type: "directory"; readonly path: string }
  | { readonly type: "archive"; readonly path: string };

function invalid(message: string): ExecutionError {
  return new ExecutionError("plugin_invalid", `invalid plugin package: ${message}`);
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined, field: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.trim() === "" || value.length > MAX_TEXT) {
    throw invalid(`${field} must be a non-empty string of at most ${MAX_TEXT} characters`);
  }
  return value;
}

function apiNumber(value: JsonValue | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalid(`${field} must be a non-negative integer`);
  }
  return value;
}

// A normalized relative path inside the package: no `..`, `.`, empty or absolute segments.
export function isPackagePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) {
    return false;
  }
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function group(value: JsonValue, index: number): PluginGroupManifest {
  if (!isRecord(value)) throw invalid(`groups[${index}] must be an object`);
  const name = text(value.name, `groups[${index}].name`)!;
  if (!PLUGIN_WORD.test(name)) throw invalid(`group name "${name}" is not a valid command word`);
  const families = value.families;
  if (
    !Array.isArray(families) ||
    !families.every((f) => typeof f === "string" && (FAMILIES as string[]).includes(f))
  ) {
    throw invalid(`groups[${index}].families must list chain families (${FAMILIES.join(", ")})`);
  }
  const description = text(value.description, `groups[${index}].description`, true);
  return {
    name,
    summary: text(value.summary, `groups[${index}].summary`)!,
    ...(description === undefined ? {} : { description }),
    families: families as ChainFamily[],
  };
}

// Reads the plugin manifest of a package.json; a package without one is not a plugin.
export function parsePluginManifest(packageJson: JsonValue): PluginManifest {
  if (!isRecord(packageJson)) throw invalid("package.json is not an object");
  const walletCli = packageJson.walletCli;
  const plugin = isRecord(walletCli) ? walletCli.plugin : undefined;
  if (!isRecord(plugin)) throw invalid("package.json has no walletCli.plugin manifest");
  const name = text(plugin.name, "walletCli.plugin.name")!;
  if (!PLUGIN_WORD.test(name)) throw invalid(`plugin name "${name}" is not valid`);
  const version = text(packageJson.version, "version")!;
  if (!SEMVER.test(version)) throw invalid(`version "${version}" is not a semantic version`);
  const entry = text(plugin.entry, "walletCli.plugin.entry")!;
  if (!isPackagePath(entry) || !/\.m?js$/.test(entry)) {
    throw invalid(`entry "${entry}" must be a .mjs or .js path inside the package`);
  }
  const groups = plugin.groups;
  if (!Array.isArray(groups) || groups.length === 0) {
    throw invalid("walletCli.plugin.groups must list at least one command group");
  }
  const parsed = groups.map(group);
  const names = parsed.map((g) => g.name);
  if (new Set(names).size !== names.length) throw invalid("a command group is listed twice");
  return {
    name,
    version,
    apiVersion: apiNumber(plugin.apiVersion, "walletCli.plugin.apiVersion"),
    apiRevision: apiNumber(plugin.apiRevision, "walletCli.plugin.apiRevision"),
    entry,
    groups: parsed,
  };
}

export type PluginCompatibility =
  | { readonly compatible: true }
  | {
      readonly compatible: false;
      // Which side must be updated so the two match.
      readonly update: "wallet-cli" | "plugin";
      readonly reason: string;
    };

export function pluginCompatibility(apiVersion: number, apiRevision: number): PluginCompatibility {
  if (apiVersion > PLUGIN_API_VERSION) {
    return {
      compatible: false,
      update: "wallet-cli",
      reason: `built for plugin API ${apiVersion}; this wallet-cli supports plugin API ${PLUGIN_API_VERSION}`,
    };
  }
  if (apiVersion < PLUGIN_API_VERSION) {
    return {
      compatible: false,
      update: "plugin",
      reason: `built for plugin API ${apiVersion}; this wallet-cli supports plugin API ${PLUGIN_API_VERSION} only`,
    };
  }
  if (apiRevision > PLUGIN_API_REVISION) {
    return {
      compatible: false,
      update: "wallet-cli",
      reason: `built against plugin API revision ${apiRevision}; this wallet-cli has revision ${PLUGIN_API_REVISION}`,
    };
  }
  return { compatible: true };
}

export function incompatiblePlugin(
  name: string,
  compatibility: Extract<PluginCompatibility, { compatible: false }>,
): ExecutionError {
  const fix =
    compatibility.update === "wallet-cli"
      ? "update wallet-cli to use it"
      : `update the plugin ${name} to a build for this wallet-cli`;
  return new ExecutionError(
    "plugin_incompatible",
    `plugin ${name} is incompatible: ${compatibility.reason}; ${fix}`,
    { plugin: name, update: compatibility.update },
  );
}

export function pluginConflict(message: string): UsageError {
  return new UsageError("plugin_conflict", message);
}

// A registry package, by name and an optional exact version or dist-tag.
export interface RegistrySpec {
  readonly name: string;
  readonly version?: string;
}

const PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const DIST_TAG = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
// Short names resolve under this scope and prefix.
const SHORT_NAME_PACKAGE = (name: string) => `@tron-walletcli/plugin-${name}`;

// `qaprobe`, `@scope/pkg`, `pkg@1.2.3`, `@scope/pkg@latest`; version ranges are refused.
export function parseRegistrySpec(spec: string): RegistrySpec {
  const at = spec.lastIndexOf("@");
  const hasVersion = at > 0;
  const name = hasVersion ? spec.slice(0, at) : spec;
  const version = hasVersion ? spec.slice(at + 1) : undefined;
  if (!PACKAGE_NAME.test(name) || name.length > 214) {
    throw new UsageError(
      "invalid_value",
      `"${spec}" is not a package name, directory or .tgz path`,
    );
  }
  if (version !== undefined && !SEMVER.test(version) && !DIST_TAG.test(version)) {
    throw new UsageError(
      "invalid_value",
      `"${version}" is not an exact version or a dist-tag; version ranges are not supported`,
    );
  }
  const resolved = !name.includes("/") && PLUGIN_WORD.test(name) ? SHORT_NAME_PACKAGE(name) : name;
  return { name: resolved, ...(version === undefined ? {} : { version }) };
}

export function formatRegistrySpec(spec: RegistrySpec): string {
  return spec.version === undefined ? spec.name : `${spec.name}@${spec.version}`;
}

// An exact version stays where it is on update; no version or a dist-tag moves.
export function isPinned(spec: RegistrySpec): boolean {
  return spec.version !== undefined && SEMVER.test(spec.version);
}
