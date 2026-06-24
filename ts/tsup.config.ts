import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // The @ledgerhq packages ship ESM builds (lib-es) with extension-less relative
  // imports (`./utils` instead of `./utils.js`) that Node's native ESM loader
  // cannot resolve — they're meant to be bundled. So bundle the whole family
  // through esbuild, which rewrites those specifiers. Only the native addons
  // (node-hid / usb) must stay external; they can't be bundled.
  noExternal: [/@ledgerhq\//],
  external: ["node-hid", "usb"],
});
