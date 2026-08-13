import { createNodeHid } from "./node-hid-runtime.js";

// The standalone build plugin resolves this static import from Ledger transport's package path.
// Bun sees the resulting `.node` file during bundling and embeds the exact addon used by transport.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const binding = require("wallet-cli-native-node-hid");

export default createNodeHid(binding);
