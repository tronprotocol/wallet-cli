import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const executable = process.argv[2] ? resolve(process.argv[2]) : undefined;
const expectedVersion =
  process.argv[3] ??
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

if (!executable) {
  throw new Error("usage: node scripts/verify-standalone.mjs EXECUTABLE [EXPECTED_VERSION]");
}

function run(args, env = process.env) {
  return spawnSync(executable, args, {
    encoding: "utf8",
    env,
    windowsHide: true,
  });
}

const version = run(["--version"]);
if (version.status !== 0 || version.stdout.trim() !== expectedVersion) {
  throw new Error(
    `version smoke test failed: status=${version.status}, stdout=${JSON.stringify(version.stdout)}, stderr=${JSON.stringify(version.stderr)}`,
  );
}

const help = run(["--help"]);
if (help.status !== 0 || !help.stdout.includes("Usage:  wallet-cli")) {
  throw new Error(
    `help smoke test failed: status=${help.status}, stdout=${JSON.stringify(help.stdout)}, stderr=${JSON.stringify(help.stderr)}`,
  );
}

// Ledger import loads the embedded addon; device_unavailable can mask addon load failures.
const isolatedHome = mkdtempSync(join(tmpdir(), "wallet-cli-standalone-"));
try {
  const ledger = run(["import", "ledger", "--app", "tron", "--index", "0", "--output", "json"], {
    ...process.env,
    WALLET_CLI_HOME: isolatedHome,
  });
  const output = `${ledger.stdout}\n${ledger.stderr}`;
  let result;
  try {
    result = JSON.parse(ledger.stdout);
  } catch {
    // Report non-JSON output in the failure below.
  }
  const imported = ledger.status === 0 && result?.success === true;
  const expectedDeviceError =
    ledger.status === 1 && result?.success === false && result?.error?.code === "device_not_found";
  if (!imported && !expectedDeviceError) {
    throw new Error(
      `Ledger native-addon smoke test failed: status=${ledger.status}, output=${JSON.stringify(output)}`,
    );
  }
} finally {
  rmSync(isolatedHome, { recursive: true, force: true });
}

console.log(`verified ${executable} (${expectedVersion})`);
