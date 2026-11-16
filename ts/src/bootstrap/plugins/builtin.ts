// The built-in plugins, in registration order; the only core module that imports plugins/.
import type { PluginDefinition } from "../../plugin-api/index.js";
import gasfree from "../../plugins/gasfree/index.js";

export const BUILTIN_PLUGINS: readonly PluginDefinition[] = [gasfree];

// x402 relays through the GasFree service until it becomes a plugin that imports this itself.
export { gasfreeOpenApi } from "../../plugins/gasfree/api.js";
