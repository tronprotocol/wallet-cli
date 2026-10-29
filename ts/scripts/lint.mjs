import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { ESLint } from "eslint";

const args = process.argv.slice(2);
const suppressionsPath = "eslint-suppressions.json";
const suppressions = JSON.parse(readFileSync(suppressionsPath, "utf8"));
const files = Object.keys(suppressions);

// The check must ignore exactly what the lint run ignores, or an excluded file keeps a stale entry.
const ignorePatterns = [];
let ignore = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--") break;
  if (args[i] === "--ignore-pattern") ignorePatterns.push(args[++i]);
  else if (args[i].startsWith("--ignore-pattern=")) ignorePatterns.push(args[i].slice(17));
  else if (["--ignore", "--ignore=true", "--no-ignore=false"].includes(args[i])) ignore = true;
  else if (["--no-ignore", "--ignore=false", "--no-ignore=true"].includes(args[i])) ignore = false;
  else if (args[i].startsWith("--ignore=") || args[i].startsWith("--no-ignore=")) {
    process.stderr.write(
      `Unsupported ignore option: ${args[i]}. Use --ignore or --no-ignore, optionally with =true or =false (no whitespace).\n`,
    );
    process.exit(2);
  }
}

// ESLint reports unused suppressions only for files in the current lint results.
const gitIgnored = new Set();
if (files.length > 0) {
  const result = spawnSync("git", ["check-ignore", "--stdin", "-z"], {
    input: files.join("\0") + "\0",
    encoding: "utf8",
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed: ${result.stderr || result.error}`);
  }
  for (const file of result.stdout.split("\0").filter(Boolean)) gitIgnored.add(file);
}

const eslint = new ESLint({ ignorePatterns, ignore });
const invalid = [];
for (const file of files) {
  // ESLint matches entries by this exact form; an alias such as ./src/a.ts is never reported unused.
  const canonical = relative(process.cwd(), resolve(file)).split(sep).join(posix.sep);
  if (file !== canonical || canonical.startsWith("../")) {
    invalid.push(`${file}: path must be relative to ts/ in ESLint's form (${canonical})`);
  } else if (!existsSync(file)) invalid.push(`${file}: file does not exist`);
  else if (gitIgnored.has(file)) invalid.push(`${file}: file is ignored by git`);
  else if (await eslint.isPathIgnored(file)) invalid.push(`${file}: file is ignored by ESLint`);
  for (const [rule, entry] of Object.entries(suppressions[file])) {
    if (!Number.isInteger(entry?.count) || entry.count < 1) {
      invalid.push(`${file}: ${rule}: count must be a positive integer`);
    }
  }
}

if (invalid.length > 0) {
  process.stderr.write(`Stale or invalid entries in ${suppressionsPath}:\n${invalid.join("\n")}\n`);
  process.stderr.write("Run npm run lint:baseline and review the diff to remove these entries.\n");
  process.exit(1);
}

const eslintBin = join(
  dirname(createRequire(import.meta.url).resolve("eslint/package.json")),
  "bin/eslint.js",
);
const lint = spawnSync(process.execPath, [eslintBin, ...args], { stdio: "inherit" });
process.exitCode = lint.status ?? 2;
