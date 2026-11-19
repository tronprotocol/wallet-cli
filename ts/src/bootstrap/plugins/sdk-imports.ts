// Serves a plugin's import of the SDK runtime entries from the API object this process publishes.
import { registerHooks } from "node:module";
import { PLUGIN_API_GLOBAL, pluginApiExportNames, type PluginApiEntry } from "./api-object.js";

// The package root holds the numbers a plugin was built for, so it stays bundled in the plugin.
const RUNTIME_ENTRIES = [
  "domain",
  "application",
  "cli",
  "http",
] as const satisfies PluginApiEntry[];

const URL_OF_SPECIFIER = new Map<string, string>(
  RUNTIME_ENTRIES.map((entry) => [
    `@tron-walletcli/plugin-sdk/${entry}`,
    `wallet-cli:plugin-sdk/${entry}`,
  ]),
);
const ENTRY_OF_URL = new Map<string, PluginApiEntry>(
  RUNTIME_ENTRIES.map((entry) => [`wallet-cli:plugin-sdk/${entry}`, entry]),
);

let registered = false;

// Once per process, before the first plugin entry is imported; the API object must be published first.
export function registerPluginSdkImports(): void {
  if (registered) return;
  registered = true;
  registerHooks({
    // Runs for every import and require of the process: any other specifier goes on unchanged.
    resolve(specifier, context, nextResolve) {
      const url = URL_OF_SPECIFIER.get(specifier);
      if (url === undefined) return nextResolve(specifier, context);
      return { url, format: "module", shortCircuit: true };
    },
    load(url, context, nextLoad) {
      const entry = ENTRY_OF_URL.get(url);
      if (entry === undefined) return nextLoad(url, context);
      return { format: "module", source: pluginSdkSource(entry), shortCircuit: true };
    },
  });
}

export function pluginSdkSource(entry: PluginApiEntry): string {
  const key = JSON.stringify(PLUGIN_API_GLOBAL.description);
  return [
    `const api = globalThis[Symbol.for(${key})].${entry};`,
    ...pluginApiExportNames(entry).map((name) => `export const ${name} = api.${name};`),
    "",
  ].join("\n");
}
