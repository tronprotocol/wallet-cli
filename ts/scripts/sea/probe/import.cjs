// SEA main: imports ES modules written to a temporary directory outside the executable.
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
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

const vmImport = new vm.Script("(url) => import(url)", {
  importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
}).runInThisContext();

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "wallet-cli-sea-probe-import-"));
  try {
    const plain = pathToFileURL(join(dir, "plain.mjs")).href;
    const tla = pathToFileURL(join(dir, "tla.mjs")).href;
    writeFileSync(join(dir, "plain.mjs"), 'export default "plain module";\n');
    writeFileSync(join(dir, "tla.mjs"), 'export default await Promise.resolve("top-level await module");\n');

    await check("running as SEA", () => {
      if (!sea.isSea()) throw new Error("node:sea isSea() is false");
      return `Node ${process.version}`;
    });
    await check("vm default loader: plain module", async () => expect((await vmImport(plain)).default, "plain module"));
    await check("vm default loader: top-level await", async () =>
      expect((await vmImport(tla)).default, "top-level await module"),
    );

    try {
      console.log(`INFO plain import(): loaded ${JSON.stringify((await import(plain)).default)}`);
    } catch (error) {
      console.log(`INFO plain import(): ${describe(error)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expect(actual, expected) {
  if (actual !== expected) throw new Error(`got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  return JSON.stringify(actual);
}

main().then(
  () => process.exit(failures === 0 ? 0 : 1),
  (error) => {
    console.log(`FAIL probe: ${error?.stack ?? error}`);
    process.exit(1);
  },
);
