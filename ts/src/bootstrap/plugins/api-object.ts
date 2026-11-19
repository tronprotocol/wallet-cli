// The one copy of the plugin API an installed plugin uses; the SDK's runtime modules read it.
import * as index from "../../plugin-sdk/index.js";
import * as domain from "../../plugin-sdk/domain.js";
import * as application from "../../plugin-sdk/application.js";
import * as cli from "../../plugin-sdk/cli.js";
import * as http from "../../plugin-sdk/http.js";

export const PLUGIN_API_GLOBAL = Symbol.for("wallet-cli.plugin-sdk");

// Every runtime export of the five entries, by entry name.
export const PLUGIN_API_OBJECT = Object.freeze({
  index: Object.freeze({ ...index }),
  domain: Object.freeze({ ...domain }),
  application: Object.freeze({ ...application }),
  cli: Object.freeze({ ...cli }),
  http: Object.freeze({ ...http }),
});

export type PluginApiEntry = keyof typeof PLUGIN_API_OBJECT;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// The export names of one entry, sorted; each is written into generated module source.
export function pluginApiExportNames(entry: PluginApiEntry): string[] {
  const names = Object.keys(PLUGIN_API_OBJECT[entry]).sort();
  for (const name of names) {
    if (!IDENTIFIER.test(name) || name === "default") throw new Error(`cannot export ${name}`);
  }
  return names;
}

// Before the first import of an installed plugin.
export function publishPluginApi(): void {
  if (Object.hasOwn(globalThis, PLUGIN_API_GLOBAL)) return;
  Object.defineProperty(globalThis, PLUGIN_API_GLOBAL, {
    value: PLUGIN_API_OBJECT,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}
