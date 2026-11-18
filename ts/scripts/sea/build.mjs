// usage: node scripts/sea/build.mjs [--outfile PATH]
// Builds wallet-cli as a Node single executable application with the Node that runs this script.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import process from "node:process";

const nodeMajor = Number.parseInt(process.versions.node.split(".", 1)[0], 10);
if (nodeMajor < 26) {
  console.error(`scripts/sea/build.mjs needs Node 26 or later (node --build-sea); this is Node ${process.version}`);
  process.exit(1);
}
// Loaded after the version check: Node 22 cannot strip the types of a .ts import.
const { build } = await import("esbuild");
const { resolveNodeHidAddon } = await import("../standalone/resolve-node-hid-addon.ts");

const outfileIndex = process.argv.indexOf("--outfile");
const defaultName = process.platform === "win32" ? "wallet-cli.exe" : "wallet-cli";
let outfile = resolve(outfileIndex === -1 ? join("standalone", defaultName) : process.argv[outfileIndex + 1]);
// --build-sea writes a PE file only when the output name ends in .exe.
if (process.platform === "win32" && extname(outfile).toLowerCase() !== ".exe") outfile += ".exe";

const { nativeAddon, nodeHidVersion } = resolveNodeHidAddon();
console.log(`using node-hid ${nodeHidVersion}: ${nativeAddon}`);

const work = mkdtempSync(join(tmpdir(), "wallet-cli-sea-"));
try {
  const main = join(work, "main.cjs");
  await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node26",
    minify: true,
    outfile: main,
    logLevel: "warning",
    // ESM dependencies (yargs-parser) call createRequire(import.meta.url), which is undefined in a CJS bundle.
    define: { "import.meta.url": "__sea_import_meta_url" },
    banner: { js: 'var __sea_import_meta_url=require("node:url").pathToFileURL(__filename).href;' },
    plugins: [
      {
        name: "sea-node-hid",
        setup(b) {
          b.onResolve({ filter: /^node-hid$/ }, () => ({ path: resolve("scripts/sea/node-hid.ts") }));
        },
      },
    ],
  });

  const config = join(work, "sea-config.json");
  writeFileSync(
    config,
    JSON.stringify({
      main,
      output: outfile,
      disableExperimentalSEAWarning: true,
      useCodeCache: true,
      // Ignore NODE_OPTIONS, as a compiled binary should not take runtime flags from the environment.
      execArgvExtension: "none",
      assets: { "HID.node": nativeAddon },
    }),
  );
  mkdirSync(dirname(outfile), { recursive: true });
  execFileSync(process.execPath, ["--build-sea", config], { stdio: "inherit" });

  // --build-sea leaves the Mach-O unsigned, and macOS refuses to run an unsigned arm64 binary.
  if (process.platform === "darwin") {
    execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", outfile], { stdio: "inherit" });
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`built ${outfile} (Node ${process.version}, ${process.platform}-${process.arch})`);
