import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // Bundle Ledger's extensionless ESM imports; Node cannot resolve them.
  // Bundle x402's compatible schema/crypto versions; consumers do not inherit overrides.
  noExternal: [
    /@ledgerhq\//,
    /^@bankofai\/x402-/,
    /^@x402\//,
    /^zod(?:\/|$)/,
    /^@noble\//,
    /^@scure\//,
  ],
  // node-hid is native; axios needs Node's CJS loader for its dynamic requires.
  external: ["node-hid", "axios"],
});
