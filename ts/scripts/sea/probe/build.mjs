// usage: node scripts/sea/probe/build.mjs --outdir DIR
// Builds each probe main next to this script into DIR/<name>-probe with the same SEA options as the wallet-cli build.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const nodeMajor = Number.parseInt(process.versions.node.split(".", 1)[0], 10);
if (nodeMajor < 26) {
  console.error(`scripts/sea/probe/build.mjs needs Node 26 or later (node --build-sea); this is Node ${process.version}`);
  process.exit(1);
}

const outdirIndex = process.argv.indexOf("--outdir");
if (outdirIndex === -1 || !process.argv[outdirIndex + 1]) {
  console.error("usage: node scripts/sea/probe/build.mjs --outdir DIR");
  process.exit(2);
}
const outdir = resolve(process.argv[outdirIndex + 1]);
mkdirSync(outdir, { recursive: true });

const here = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), "wallet-cli-sea-probe-"));
try {
  for (const name of ["import", "hooks"]) {
    const output = join(outdir, `${name}-probe${process.platform === "win32" ? ".exe" : ""}`);
    const config = join(work, `${name}.json`);
    writeFileSync(
      config,
      JSON.stringify({
        main: join(here, `${name}.cjs`),
        output,
        disableExperimentalSEAWarning: true,
        useCodeCache: true,
        execArgvExtension: "none",
      }),
    );
    execFileSync(process.execPath, ["--build-sea", config], { stdio: "inherit" });
    if (process.platform === "darwin") {
      execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", output], { stdio: "inherit" });
    }
    console.log(`built ${output}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
