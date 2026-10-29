// Run the real lint scripts and ESLint config against isolated fixture trees.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const VIOLATION = `console.log(1);\n`;
const CLEAN = `export const clean = 1;\n`;

describe("ESLint suppressions gate", () => {
  let dir: string;
  let suppressionsPath: string;

  function write(rel: string, source: string) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), source);
  }

  function run(script: string, ...args: string[]) {
    return spawnSync("npm", ["run", script, "--", ...args], { cwd: dir, encoding: "utf8" });
  }

  function suppressions() {
    return JSON.parse(readFileSync(suppressionsPath, "utf8"));
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wallet-cli-eslint-"));
    symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));
    for (const file of [
      "eslint.config.js",
      "package.json",
      "scripts/lint.mjs",
      "eslint-rules/environment-reads.mjs",
    ]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(repo, file), join(dir, file));
    }
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, ".gitignore"), "node_modules/\nlocal/\n");
    write("src/known.ts", VIOLATION + VIOLATION);
    write("src/clean.ts", CLEAN);
    suppressionsPath = join(dir, "eslint-suppressions.json");
    expect(run("lint:baseline").status).toBe(0);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("records exactly the current violations and allows them", () => {
    const before = readFileSync(suppressionsPath, "utf8");
    expect(JSON.parse(before)).toEqual({ "src/known.ts": { "no-console": { count: 2 } } });
    const result = run("lint");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(run("lint:baseline").status).toBe(0);
    expect(readFileSync(suppressionsPath, "utf8")).toBe(before);
  });

  it("rejects a violation in another file", () => {
    write("src/clean.ts", VIOLATION);
    const result = run("lint");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("src/clean.ts");
  });

  it("rejects an extra violation of a known rule in a known file", () => {
    write("src/known.ts", VIOLATION + VIOLATION + VIOLATION);
    const result = run("lint");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("no-console");
  });

  it("rejects a violation of another rule in a known file", () => {
    write("src/known.ts", VIOLATION + VIOLATION + `debugger;\n`);
    const result = run("lint");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("no-debugger");
  });

  it.each([
    ["fully", CLEAN],
    ["partly", VIOLATION],
  ])("rejects a %s fixed entry until regeneration removes it", (_, source) => {
    write("src/known.ts", source);
    const result = run("lint");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("There are suppressions left that do not occur anymore");
    expect(run("lint:baseline").status).toBe(0);
    expect(run("lint").status).toBe(0);
  });

  it.each([
    ["does not exist", "src/deleted.ts", ""],
    ["is ignored by ESLint", "scripts/build.ts", VIOLATION],
    ["is ignored by git", "local/notes.ts", VIOLATION],
    ["is ignored by git", "local/測試.ts", VIOLATION],
    ["is ignored by git", "local/line\nbreak.ts", VIOLATION],
  ])("rejects an entry for a file that %s", (reason, file, source) => {
    if (source) write(file, source);
    writeFileSync(
      suppressionsPath,
      JSON.stringify({ ...suppressions(), [file]: { "no-console": { count: 1 } } }),
    );
    const result = run("lint", "--ignore-pattern", "local/**");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${file}: file ${reason}`);
  });

  it("rejects an entry for a known file excluded by a command-line ignore pattern", () => {
    write("src/known.ts", CLEAN);
    for (const args of [["--ignore-pattern", "src/known.ts"], ["--ignore-pattern=src/known.ts"]]) {
      const result = run("lint", ...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("src/known.ts: file is ignored by ESLint");
    }
  });

  it("uses the same ignore override and negated patterns as ESLint", () => {
    for (const args of [
      ["--ignore-pattern", "src/known.ts", "--no-ignore", "--global", "process"],
      ["--ignore-pattern", "src/*.ts", "--ignore-pattern", "!src/known.ts"],
    ]) {
      const result = run("lint", ...args);
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }
  });

  it.each([
    { args: ["--ignore"], ignored: true },
    { args: ["--no-ignore"], ignored: false },
    { args: ["--ignore=true"], ignored: true },
    { args: ["--ignore=false"], ignored: false },
    { args: ["--no-ignore=true"], ignored: false },
    { args: ["--no-ignore=false"], ignored: true },
    { args: ["--no-ignore", "--ignore"], ignored: true },
    { args: ["--ignore", "--no-ignore"], ignored: false },
    { args: ["--ignore=false", "--ignore"], ignored: true },
    { args: ["--no-ignore", "--ignore=true"], ignored: true },
    { args: ["--ignore=true", "--ignore=false"], ignored: false },
    { args: ["--ignore=false", "--no-ignore=false"], ignored: true },
  ])("applies boolean ignore options $args to valid and stale entries", ({ args, ignored }) => {
    for (const stale of [false, true]) {
      write("src/known.ts", stale ? CLEAN : VIOLATION + VIOLATION);
      const options = [...args, "--ignore-pattern", "src/known.ts", "--global", "process"];
      const native = spawnSync(
        process.execPath,
        [join(repo, "node_modules/eslint/bin/eslint.js"), ".", ...options],
        { cwd: dir, encoding: "utf8" },
      );
      const nativeStatus = !ignored && stale ? 2 : 0;
      expect(native.status, native.stdout + native.stderr).toBe(nativeStatus);
      const result = run("lint", ...options);
      expect(result.status, result.stdout + result.stderr).toBe(ignored ? 1 : nativeStatus);
      if (ignored) expect(result.stderr).toContain("src/known.ts: file is ignored by ESLint");
      else if (stale) {
        expect(result.stderr).toContain("There are suppressions left that do not occur anymore");
      }
    }
  });

  it.each(["--ignore=1", "--no-ignore=maybe", "--ignore=", "--ignore= true"])(
    "rejects unsupported boolean ignore assignment %s explicitly",
    (arg) => {
      const result = run("lint", arg);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`Unsupported ignore option: ${arg}`);
    },
  );

  it("does not parse boolean ignore options after the argument terminator", () => {
    write("--ignore=true/clean.ts", CLEAN);
    const result = run(
      "lint",
      "--no-ignore",
      "--ignore-pattern",
      "src/known.ts",
      "--global",
      "process",
      "--",
      "--ignore=true",
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it.each(["./src/known.ts", "src//known.ts", "src/../src/known.ts"])(
    "rejects the noncanonical key %s",
    (key) => {
      write("src/known.ts", CLEAN);
      writeFileSync(suppressionsPath, JSON.stringify({ [key]: { "no-console": { count: 2 } } }));
      const result = run("lint");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`${key}: path must be relative to ts/ in ESLint's form`);
    },
  );

  it.each([0, -1, 1.5, "1"])("rejects a count of %j", (count) => {
    writeFileSync(
      suppressionsPath,
      JSON.stringify({ "src/known.ts": { "no-console": { count } } }),
    );
    const result = run("lint");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/known.ts: no-console: count must be a positive integer");
  });

  it("fails when git cannot classify the entries", () => {
    rmSync(join(dir, ".git"), { recursive: true, force: true });
    const result = run("lint");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("git check-ignore failed");
  });

  it.each(["missing", "malformed"])("rejects a %s suppressions file", (state) => {
    if (state === "missing") rmSync(suppressionsPath);
    else writeFileSync(suppressionsPath, "{");
    expect(run("lint").status).not.toBe(0);
  });

  it("passes command-line ignore patterns to ESLint when linting and regenerating", () => {
    write("local/notes.ts", VIOLATION);
    expect(run("lint").status).toBe(1);
    expect(run("lint", "--ignore-pattern", "local/**").status).toBe(0);
    expect(run("lint:baseline", "--ignore-pattern", "local/**").status).toBe(0);
    expect(Object.keys(suppressions())).toEqual(["src/known.ts"]);
  });
});
