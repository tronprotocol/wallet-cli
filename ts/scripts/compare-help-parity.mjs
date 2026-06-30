import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = join(root, "docs/baselines/nile-full-command-test-2026-06-29-run2-rawlogs.md");
const originalEntry = resolve(root, "../ts/src/index.ts");
const refactorEntry = join(root, "src/index.ts");
const tsx = join(root, "node_modules/.bin/tsx");

const helpSection = readFileSync(baseline, "utf8").split("## 1. Wallet & account management")[0];
const cases = [...helpSection.matchAll(
  /```\n\$ wallet-cli (.*--help)\n([\s\S]*?)\n# exit=(\d+)\n```/g,
)].map((match) => ({
  invocation: match[1].trim(),
  expectedStdout: `${match[2]}\n`,
  expectedStatus: Number(match[3]),
}));

if (cases.length === 0) throw new Error("baseline contains no help invocations");

function execute(entry, args) {
  const home = mkdtempSync(join(tmpdir(), "wallet-cli-parity-"));
  const result = spawnSync(tsx, [entry, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", WALLET_CLI_HOME: home },
    timeout: 20_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const failures = [];
for (const { invocation, expectedStdout, expectedStatus } of cases) {
  const args = invocation.split(/\s+/);
  const original = execute(originalEntry, args);
  const refactor = execute(refactorEntry, args);
  if (
    original.status !== refactor.status ||
    original.stdout !== refactor.stdout ||
    original.stderr !== refactor.stderr ||
    refactor.status !== expectedStatus ||
    refactor.stdout !== expectedStdout
  ) {
    failures.push({ invocation, original, refactor, expectedStdout, expectedStatus });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`parity mismatch: wallet-cli ${failure.invocation}\n`);
    process.stderr.write(`  original exit=${failure.original.status}\n`);
    process.stderr.write(`  refactor exit=${failure.refactor.status}\n`);
    if (failure.original.stdout !== failure.refactor.stdout) process.stderr.write("  stdout differs\n");
    if (failure.original.stderr !== failure.refactor.stderr) process.stderr.write("  stderr differs\n");
    if (failure.refactor.status !== failure.expectedStatus) process.stderr.write("  baseline exit differs\n");
    if (failure.refactor.stdout !== failure.expectedStdout) process.stderr.write("  baseline stdout differs\n");
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`help parity passed: ${cases.length} invocations (original + raw-log baseline)\n`);
}
