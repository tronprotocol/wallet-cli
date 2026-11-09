import { createNodeHid } from "./node-hid-runtime.js";

// The build plugin embeds the addon resolved from Ledger transport's dependencies.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const binding = require("wallet-cli-native-node-hid");

export default createNodeHid(binding);
