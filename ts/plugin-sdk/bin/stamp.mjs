#!/usr/bin/env node
// Writes the plugin API version and revision this SDK was built for into a plugin's package.json.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const { apiVersion, apiRevision } = JSON.parse(
  readFileSync(new URL("../dist/version.json", import.meta.url), "utf8"),
);
const path = resolve(process.argv[2] ?? "package.json");
const pkg = JSON.parse(readFileSync(path, "utf8"));
const plugin = pkg.walletCli?.plugin;
if (typeof plugin !== "object" || plugin === null) {
  console.error(`${path} has no walletCli.plugin object to stamp`);
  process.exit(1);
}
plugin.apiVersion = apiVersion;
plugin.apiRevision = apiRevision;
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`${path}: plugin API ${apiVersion}.${apiRevision}`);
