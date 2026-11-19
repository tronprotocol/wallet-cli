import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRawAsset } from "node:sea";
import { removeAddonCopies } from "../../src/adapters/outbound/ledger/addon-copies.js";
import { createNodeHid } from "./node-hid-runtime.js";

const PREFIX = "wallet-cli-hid-";
type Binding = Parameters<typeof createNodeHid>[0];

// process.dlopen needs a file. Each start extracts into a new private directory: a fixed path in a shared
// temp directory would let another local user plant the native code that gets loaded.
function loadAddon(): { binding: Binding; vanished: boolean } {
  const dir = mkdtempSync(join(tmpdir(), PREFIX));
  const file = join(dir, "HID.node");
  writeFileSync(file, new Uint8Array(getRawAsset("HID.node")), { mode: 0o700, flag: "wx" });
  const addon = { exports: {} as Binding };
  try {
    process.dlopen(addon, file);
    return { binding: addon.exports, vanished: false };
  } catch (error) {
    // Another start removed the copy before this one loaded it.
    if (!existsSync(file)) return { binding: addon.exports, vanished: true };
    throw error;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps a loaded DLL locked; a later start removes the copy.
    }
  }
}

removeAddonCopies(tmpdir(), PREFIX);
let loaded = loadAddon();
if (loaded.vanished) loaded = loadAddon();
if (loaded.vanished) throw new Error("the Ledger HID addon was removed before it could be loaded");

export default createNodeHid(loaded.binding);
