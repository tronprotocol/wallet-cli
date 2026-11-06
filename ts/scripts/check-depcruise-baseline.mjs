import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const baselinePath = ".dependency-cruiser-known-violations.json";
const known = JSON.parse(readFileSync(baselinePath, "utf8"));
const current = JSON.parse(
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/dependency-cruiser/bin/dependency-cruise.mjs", import.meta.url),
      ),
      "src",
      "--output-type",
      "baseline",
      "--no-ignore-known",
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ),
);

function violationKey({ rule, from, to, cycle, via }) {
  return JSON.stringify(
    cycle
      ? [rule.name, cycle.map((module) => module.name).sort()]
      : [rule.name, from, to, via?.map((module) => module.name).sort()],
  );
}

const currentKeys = new Set(current.map(violationKey));
const seen = new Set();
const stale = known.filter((entry) => {
  const key = violationKey(entry);
  const invalid = seen.has(key) || !currentKeys.has(key);
  seen.add(key);
  return invalid;
});

if (stale.length > 0) {
  process.stderr.write(
    `Stale or duplicate entries in ${baselinePath}:\n${JSON.stringify(stale, null, 2)}\n`,
  );
  process.stderr.write(
    "Run npm run depcruise:baseline and review the diff to remove these entries.\n",
  );
  process.exitCode = 1;
}
