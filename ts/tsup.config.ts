import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // Bundle Ledger's extensionless ESM imports; Node cannot resolve them.
  noExternal: [/@ledgerhq\//, /^zod(?:\/|$)/, /^@noble\//, /^@scure\//],
  // node-hid is native; axios needs Node's CJS loader for its dynamic requires.
  external: ["node-hid", "axios"],
});
