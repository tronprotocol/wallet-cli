import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "docs/baselines/nile-full-command-test-2026-06-29-run2-rawlogs.md");
const reportPath = join(root, "docs/nile-full-command-test-2026-06-29-run2-rawlogs.md");
const privateEnvPath = resolve(root, "../ts/.private/.env.test");

function blocks(path) {
  const markdown = readFileSync(path, "utf8");
  return [...markdown.matchAll(/```\n\$ ([^\n]+)\n([\s\S]*?)\n# exit=(\d+)\n```/g)]
    .map((match) => ({ command: match[1], output: match[2], exit: Number(match[3]) }));
}

function envelope(block) {
  for (const line of block.output.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    try {
      const value = JSON.parse(line);
      if (value?.schema === "wallet-cli.result.v1") return value;
    } catch {
      // The historical baseline contains one intentionally truncated sign-only JSON line.
    }
  }
}

function byCommand(items) {
  const result = new Map();
  for (const block of items) {
    const value = envelope(block);
    if (!value) continue;
    const list = result.get(value.command) ?? [];
    list.push(value);
    result.set(value.command, list);
  }
  return result;
}

function dataKeys(values) {
  return new Set(values.flatMap((value) => {
    const data = value.data;
    if (Array.isArray(data)) return data.length > 0 && typeof data[0] === "object"
      ? Object.keys(data[0])
      : [];
    return data && typeof data === "object" ? Object.keys(data) : [];
  }));
}

const baseline = blocks(baselinePath);
const actual = blocks(reportPath);
const baselineEnvelopes = byCommand(baseline);
const actualEnvelopes = byCommand(actual);
const failures = [];

for (const [command, expected] of baselineEnvelopes) {
  const observed = actualEnvelopes.get(command);
  if (!observed) {
    failures.push(`missing JSON command envelope: ${command}`);
    continue;
  }
  const expectedSuccess = expected.some((value) => value.success === true);
  if (expectedSuccess && !observed.some((value) => value.success === true)) {
    failures.push(`no successful JSON envelope for ${command}`);
  }
  const expectedKeys = dataKeys(expected.filter((value) => value.success));
  const observedKeys = dataKeys(observed.filter((value) => value.success));
  for (const key of expectedKeys) {
    if (!observedKeys.has(key)) failures.push(`${command} is missing baseline data key: ${key}`);
  }
  for (const value of observed) {
    if (value.schema !== "wallet-cli.result.v1") failures.push(`${command} schema changed`);
    if (!value.meta || typeof value.meta.durationMs !== "number" || !Array.isArray(value.meta.warnings)) {
      failures.push(`${command} meta contract changed`);
    }
    if (command.startsWith("tron.") && !value.chain) failures.push(`${command} omitted chain`);
    if (!command.startsWith("tron.") && value.chain) failures.push(`${command} unexpectedly has chain`);
  }
}

const expectedErrors = new Set(baseline.flatMap((block) => {
  const value = envelope(block);
  return value?.success === false ? [value.error?.code] : [];
}).filter(Boolean));
const observedErrors = new Set(actual.flatMap((block) => {
  const value = envelope(block);
  if (value?.success === false) return [value.error?.code];
  const match = /^error \[([^\]]+)\]:/m.exec(block.output);
  return match ? [match[1]] : [];
}).filter(Boolean));
for (const code of expectedErrors) {
  if (!observedErrors.has(code)) failures.push(`missing baseline error code: ${code}`);
}

const privateValues = readFileSync(privateEnvPath, "utf8").split(/\r?\n/).flatMap((line) => {
  const at = line.indexOf("=");
  if (at < 1) return [];
  return [line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, "$2")];
}).filter(Boolean);
const report = readFileSync(reportPath, "utf8");
if (privateValues.some((value) => report.includes(value))) failures.push("private test material leaked into report");

if (actual.length < baseline.length) {
  failures.push(`live coverage regressed: baseline=${baseline.length}, actual=${actual.length}`);
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `live report parity passed: ${actual.length} blocks, ${actualEnvelopes.size} JSON command contracts, ` +
    `${observedErrors.size} error codes\n`,
  );
}

