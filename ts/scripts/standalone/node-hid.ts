import { tmpdir } from "node:os";
import { getRawAsset } from "node:sea";
import { loadAddonCopy } from "../../src/adapters/outbound/ledger/addon-copies.js";
import { createNodeHid } from "./node-hid-runtime.js";

type Binding = Parameters<typeof createNodeHid>[0];

// process.dlopen needs a file, so the embedded addon is loaded from a private temporary copy.
const binding = loadAddonCopy({
  root: tmpdir(),
  prefix: "wallet-cli-hid-",
  bytes: new Uint8Array(getRawAsset("HID.node")),
  load: (file) => {
    const addon = { exports: {} as Binding };
    process.dlopen(addon, file);
    return addon.exports;
  },
});

export default createNodeHid(binding);
