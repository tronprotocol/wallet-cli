import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PLUGIN_API_OBJECT, publishPluginApi } from "./api-object.js";
import { vmLoaderImporter } from "./import-plugin.js";
import { pluginSdkSource, registerPluginSdkImports } from "./sdk-imports.js";

const directory = mkdtempSync(join(tmpdir(), "sdk-imports-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

// The vm loader is Node's own ES module loader; the test runner's import() would bypass the hooks.
const load = vmLoaderImporter();
function entryFile(name: string, source: string): string {
  const path = join(directory, name);
  writeFileSync(path, source);
  return pathToFileURL(path).href;
}

beforeAll(() => {
  publishPluginApi();
  registerPluginSdkImports();
  registerPluginSdkImports();
});

it("serves the four runtime entries from the published API object, whoever imports them", async () => {
  const url = entryFile(
    "plugin.mjs",
    `import { join } from "node:path";
import * as domain from "@tron-walletcli/plugin-sdk/domain";
import * as application from "@tron-walletcli/plugin-sdk/application";
import * as cli from "@tron-walletcli/plugin-sdk/cli";
import * as http from "@tron-walletcli/plugin-sdk/http";
export default { domain, application, cli, http, joined: join("a", "b") };
`,
  );
  const served = (await load(url)).default as Record<string, Record<string, unknown>>;
  for (const entry of ["domain", "application", "cli", "http"] as const) {
    const object = PLUGIN_API_OBJECT[entry] as Record<string, unknown>;
    expect(Object.keys(served[entry]!).sort()).toEqual(Object.keys(object).sort());
    for (const name of Object.keys(object)) expect(served[entry]![name]).toBe(object[name]);
  }
  expect(served.joined).toBe(join("a", "b"));
});

it.each(["@tron-walletcli/plugin-sdk", "@tron-walletcli/plugin-sdk/testing"])(
  "passes %s on to Node's resolution",
  async (specifier) => {
    const url = entryFile(
      `other-${specifier.length}.mjs`,
      `import ${JSON.stringify(specifier)};\n`,
    );
    await expect(load(url)).rejects.toMatchObject({ code: "ERR_MODULE_NOT_FOUND" });
  },
);

it("fails the import of a name the core does not export", async () => {
  const url = entryFile(
    "missing.mjs",
    `import { noSuchExport } from "@tron-walletcli/plugin-sdk/domain";\nexport default noSuchExport;\n`,
  );
  await expect(load(url)).rejects.toThrow(/does not provide an export named 'noSuchExport'/);
});

it("reads the entry's object from the global and exports each name", () => {
  const source = pluginSdkSource("http");
  expect(source.split("\n")[0]).toBe(
    'const api = globalThis[Symbol.for("wallet-cli.plugin-sdk")].http;',
  );
  for (const name of Object.keys(PLUGIN_API_OBJECT.http)) {
    expect(source).toContain(`export const ${name} = api.${name};`);
  }
});
