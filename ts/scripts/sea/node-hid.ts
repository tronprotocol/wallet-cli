import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRawAsset } from "node:sea";
import { createNodeHid } from "../standalone/node-hid-runtime.js";

// process.dlopen needs a file. Each start extracts into a new private directory: a fixed path in a shared
// temp directory would let another local user plant the native code that gets loaded.
const dir = mkdtempSync(join(tmpdir(), "wallet-cli-hid-"));
const file = join(dir, "HID.node");
writeFileSync(file, new Uint8Array(getRawAsset("HID.node")), { mode: 0o700, flag: "wx" });
const addon = { exports: {} as Parameters<typeof createNodeHid>[0] };
try {
  process.dlopen(addon, file);
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps a loaded DLL locked; the copy stays in the user's own temp directory.
  }
}

export default createNodeHid(addon.exports);
