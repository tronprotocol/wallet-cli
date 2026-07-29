import { createNodeHid } from "./node-hid-runtime.js";

// Bun embeds N-API addons only when the `.node` file is referenced directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const binding = require("../../node_modules/node-hid/build/Release/HID.node");

export default createNodeHid(binding);
