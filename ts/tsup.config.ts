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
  // through esbuild, which rewrites those specifiers.
  noExternal: [/@ledgerhq\//],
  // Kept external, resolved from node_modules at runtime:
  //  - node-hid / usb: native .node addons esbuild cannot bundle.
  //  - axios: a CJS dep dragged in by @ledgerhq's Speculos transport. Bundling it
  //    into ESM turns its require("util")/require("http") into esbuild's __require
  //    shim, which throws (`Dynamic require of "util" is not supported`) because an
  //    ESM module has no `require`. Left external, Node loads it natively (real
  //    require), so no shim/banner is needed. Declared in dependencies + pinned via
  //    overrides to ^1.18.1 (post-2026-03 supply-chain-safe).
  external: ["node-hid", "usb", "axios"],
});
