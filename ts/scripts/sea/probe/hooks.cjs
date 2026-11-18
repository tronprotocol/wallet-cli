// SEA main: module.registerHooks supplies a host module to an ES module outside the executable.
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const module_ = require("node:module");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");
const sea = require("node:sea");

let failures = 0;
const describe = (error) => [error?.code, String(error?.message ?? error).split("\n")[0]].filter(Boolean).join(" ");
async function check(name, run) {
  try {
    console.log(`PASS ${name}: ${await run()}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${describe(error)}`);
  }
}

class HostError extends Error {}
const HOST = Symbol.for("wallet-cli.sea-probe.host");
const HOST_URL = "wallet-cli-sea-probe:host";
globalThis[HOST] = { HostError, greet: (who) => `hello ${who} from the host` };

const vmImport = new vm.Script("(url) => import(url)", {
  importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
}).runInThisContext();

async function main() {
  await check("running as SEA", () => {
    if (!sea.isSea()) throw new Error("node:sea isSea() is false");
    return `Node ${process.version}`;
  });
  await check("module.registerHooks", () => {
    // A hook returns source text, so the host module reads the host's live values from a global.
    module_.registerHooks({
      resolve: (specifier, context, next) =>
        specifier === "@host/api" ? { url: HOST_URL, shortCircuit: true } : next(specifier, context),
      load: (url, context, next) =>
        url === HOST_URL
          ? {
              format: "module",
              shortCircuit: true,
              source: `const host = globalThis[Symbol.for(${JSON.stringify(HOST.description)})];
export const HostError = host.HostError;
export const greet = host.greet;`,
            }
          : next(url, context),
    });
    return "registered";
  });

  const dir = mkdtempSync(join(tmpdir(), "wallet-cli-sea-probe-hooks-"));
  try {
    writeFileSync(
      join(dir, "plugin.mjs"),
      `import { HostError, greet } from "@host/api";
export const greeting = greet("plugin");
export function fail() { throw new HostError("thrown by the plugin"); }
`,
    );
    let plugin;
    await check("bare specifier resolves to the host module", async () => {
      plugin = await vmImport(pathToFileURL(join(dir, "plugin.mjs")).href);
      if (plugin.greeting !== "hello plugin from the host") throw new Error(`got ${JSON.stringify(plugin.greeting)}`);
      return JSON.stringify(plugin.greeting);
    });
    await check("plugin error is an instance of the host class", () => {
      if (!plugin) throw new Error("plugin did not load");
      try {
        plugin.fail();
      } catch (error) {
        if (error instanceof HostError) return "instanceof HostError";
        throw new Error(`not an instance of HostError: ${error}`);
      }
      throw new Error("plugin did not throw");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(failures === 0 ? 0 : 1),
  (error) => {
    console.log(`FAIL probe: ${error?.stack ?? error}`);
    process.exit(1);
  },
);
