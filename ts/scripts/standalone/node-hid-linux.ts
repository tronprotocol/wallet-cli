import { createNodeHid } from "./node-hid-runtime.js";

// Linux uses node-hid's hidraw backend by default. It avoids claiming the whole USB device and
// matches the behavior of node-hid's regular runtime loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const binding = require("../../node_modules/node-hid/build/Release/HID_hidraw.node");

export default createNodeHid(binding);
