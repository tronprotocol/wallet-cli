// usage: node scripts/build-standalone.mjs [--outfile PATH]
// Builds wallet-cli as a Node single executable application with the Node that runs this script, for the
// platform this script runs on.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const nodeMajor = Number.parseInt(process.versions.node.split(".", 1)[0], 10);
if (nodeMajor < 26) {
  console.error(
    `scripts/build-standalone.mjs needs Node 26 or later (node --build-sea); this is Node ${process.version}`,
  );
  process.exit(1);
}
// Loaded after the version check: an older Node cannot strip the types of a .ts import.
const { build } = await import("esbuild");
const { resolveNodeHidAddon } = await import("./standalone/resolve-node-hid-addon.ts");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const defaultName = process.platform === "win32" ? "wallet-cli.exe" : "wallet-cli";
const requestedOutfile = resolve(option("--outfile") ?? join("standalone", defaultName));
// --build-sea writes a PE file only when the output name ends in .exe.
const outfile =
  process.platform === "win32" && extname(requestedOutfile).toLowerCase() !== ".exe"
    ? `${requestedOutfile}.exe`
    : requestedOutfile;
const outfileExt = extname(outfile);
const outfileStem = outfileExt ? outfile.slice(0, -outfileExt.length) : outfile;
const stagedOutfile = `${outfileStem}.${process.pid}.${Date.now()}.building${outfileExt}`;
const { nativeAddon, nodeHidVersion, transportPackageJson } = resolveNodeHidAddon();
console.log(
  `using node-hid ${nodeHidVersion} resolved from ${transportPackageJson}: ${nativeAddon}`,
);

mkdirSync(dirname(outfile), { recursive: true });

const work = mkdtempSync(join(tmpdir(), "wallet-cli-sea-"));
try {
  const main = join(work, "main.cjs");
  await build({
    entryPoints: [resolve("src/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node26",
    minify: true,
    outfile: main,
    logLevel: "warning",
    // ESM dependencies (yargs-parser) call createRequire(import.meta.url), which is undefined in a CJS bundle.
    define: { "import.meta.url": "__sea_import_meta_url" },
    banner: {
      js: 'var __sea_import_meta_url=require("node:url").pathToFileURL(__filename).href;',
    },
    plugins: [
      {
        name: "standalone-node-hid",
        setup(b) {
          b.onResolve({ filter: /^node-hid$/ }, () => ({
            path: resolve("scripts/standalone/node-hid.ts"),
          }));
        },
      },
    ],
  });

  const config = join(work, "sea-config.json");
  writeFileSync(
    config,
    JSON.stringify({
      main,
      output: stagedOutfile,
      disableExperimentalSEAWarning: true,
      useCodeCache: true,
      // The executable takes no runtime options from NODE_OPTIONS.
      execArgvExtension: "none",
      assets: { "HID.node": nativeAddon },
    }),
  );
  run(process.execPath, ["--build-sea", config]);
  // --build-sea leaves the Mach-O unsigned, and macOS refuses to run an unsigned arm64 binary.
  if (process.platform === "darwin") {
    run("/usr/bin/codesign", ["--force", "--sign", "-", stagedOutfile]);
  }
  await publishExecutable(stagedOutfile, outfile);
  console.log(`built ${outfile} (Node ${process.version}, ${process.platform}-${process.arch})`);
} finally {
  rmSync(work, { recursive: true, force: true });
  try {
    if (existsSync(stagedOutfile)) unlinkSync(stagedOutfile);
  } catch {
    // Preserve the primary build error.
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

async function publishExecutable(staged, destination) {
  const attempts = process.platform === "win32" ? 12 : 1;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      renameSync(staged, destination);
      return;
    } catch (error) {
      lastError = error;
    }

    // Windows may require unlinking before rename; a running executable remains locked.
    if (process.platform === "win32" && existsSync(destination)) {
      try {
        unlinkSync(destination);
        renameSync(staged, destination);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (!isRetryableWindowsLock(lastError) || attempt === attempts - 1) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(50 * 2 ** attempt, 500)));
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  const executableName = destination.split(/[\\/]/).at(-1);
  const hint =
    process.platform === "win32"
      ? ` Close every running ${executableName} process and retry; ` +
        `inspect locks with: tasklist /FI "IMAGENAME eq ${executableName}".`
      : "";
  throw new Error(`failed to publish standalone executable to ${destination}${detail}.${hint}`, {
    cause: lastError,
  });
}

function isRetryableWindowsLock(error) {
  if (process.platform !== "win32" || typeof error !== "object" || error === null) return false;
  return new Set(["EPERM", "EACCES", "EBUSY", "EEXIST", "ENOTEMPTY"]).has(error.code);
}
