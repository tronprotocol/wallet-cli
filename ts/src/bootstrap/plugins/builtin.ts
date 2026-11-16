// The built-in plugins, in registration order; the only core module that imports plugins/.
import type { PluginDefinition } from "../../plugin-api/index.js";
import gasfree from "../../plugins/gasfree/index.js";
import erc8004 from "../../plugins/erc8004/index.js";
import x402 from "../../plugins/x402/index.js";
import bai from "../../plugins/bai/index.js";

// x402 relays through GasFree; B.AI pays through x402.
export const BUILTIN_PLUGINS: readonly PluginDefinition[] = [gasfree, erc8004, x402, bai];
