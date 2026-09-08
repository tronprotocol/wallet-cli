import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const temp = mkdtempSync(join(tmpdir(), "wallet-cli-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const call = (cmd, args, cwd = root, env = process.env) =>
  execFileSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
try {
  const [packed] = JSON.parse(call(npm, ["pack", "--json", "--pack-destination", temp]));
  const forbidden = packed.files.filter(
    ({ path }) =>
      path.startsWith("docs/development/") &&
      path !== "docs/development/erc8004-sdk-integration.md",
  );
  assert.equal(forbidden.length, 0, "internal development reports must not be packaged");
  assert(
    packed.files.some(({ path }) => path === "dist/index.js"),
    "missing CLI entry",
  );
  call(npm, ["init", "-y"], temp);
  call(npm, ["install", join(temp, packed.filename), "--no-audit", "--no-fund"], temp);
  const entry = join(temp, "node_modules/@tron-walletcli/wallet-cli/dist/index.js");
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  assert.equal(call(process.execPath, [entry, "--version"], temp).trim(), version);
  const env = { ...process.env, WALLET_CLI_TEST_ENTRY: entry };
  const output = call(
    process.execPath,
    [
      join(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "test/beta-command-surface.test.ts",
      "test/beta-server-roundtrip.test.ts",
      "test/erc8004.test.ts",
      "test/x402-provider-payment.test.ts",
      "test/bai-nile-compatibility.test.ts",
      "test/beta-artifact-signing.test.ts",
      "--maxWorkers=4",
    ],
    root,
    env,
  );
  process.stdout.write(output);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
