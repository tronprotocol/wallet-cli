import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const ruleId = "wallet-cli/environment-reads";
let dir: string;
let eslint: ESLint;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "wallet-cli-environment-rule-"));
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
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
  eslint = new ESLint({ cwd: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function messages(source: string, file = "src/application/services/environment.ts") {
  const [result] = await eslint.lintText(source, { filePath: join(dir, file) });
  expect(result!.fatalErrorCount).toBe(0);
  return result!.messages.filter((message) => message.ruleId === ruleId);
}

describe("environment reads", () => {
  it.each([
    "process.env.TOKEN;",
    "process['env']['TOKEN'];",
    "process[`env`].TOKEN;",
    "process?.env?.TOKEN;",
    "(process as NodeJS.Process).env.TOKEN;",
    "process.env!['TOKEN'];",
    "const copy = { ...process.env };",
    "const environment = process.env;",
    "const { TOKEN } = process.env;",
    "const { env } = process;",
    "const { env: environment } = process;",
    "const { ['env']: { TOKEN } } = process;",
    "let environment; ({ env: environment } = process);",
    "globalThis.process.env.TOKEN;",
    "global['process']['env'].TOKEN;",
    "import process from 'node:process'; process.env.TOKEN;",
    "import p from 'process'; p.env.TOKEN;",
    "import * as p from 'node:process'; p['env'].TOKEN;",
    "import { default as p } from 'node:process'; p.env.TOKEN;",
    "import { env as environment } from 'node:process'; environment.TOKEN;",
    "import { env } from 'process'; const copy = env;",
    "require('node:process').env.TOKEN;",
    "const { env } = require('process');",
    "process.env.TOKEN += 'suffix';",
    "process.env.TOKEN ||= 'fallback';",
    "process.env.TOKEN ??= 'fallback';",
    "process.env.COUNT++;",
    "process.env.TOKEN = process.env.OTHER;",
    "process.env.settings.value = 1;",
  ])("reports a read: %s", async (source) => {
    expect(await messages(source)).toHaveLength(1);
  });

  it.each([
    "process.env.TOKEN = 'test';",
    "delete process.env.TOKEN;",
    "process['env'][`TOKEN`] = 'test';",
    "delete process['env']['TOKEN'];",
    "process.env = {};",
    "process.env.TOKEN! = 'test';",
    "({ value: process.env.TOKEN } = input);",
    "[process.env.TOKEN] = input;",
    "for (process.env.TOKEN of values) {}",
    "import { env } from 'node:process'; env.TOKEN = 'test'; delete env.TOKEN;",
    "const process = { env: { TOKEN: 'local' } }; process.env.TOKEN;",
    "function read(process: { env: object }) { return process.env; }",
    "import process from './local.js'; process.env.TOKEN;",
    "const globalThis = { process: { env: {} } }; globalThis.process.env;",
    "function read(require: (name: string) => any) { return require('process').env; }",
    "function read(process: object) { const { env } = process; return env; }",
    "import { env } from 'node:process'; function read(env: object) { return env; }",
    "import { stdout } from 'node:process'; stdout.write('text');",
    "type Environment = typeof process.env;",
  ])("allows writes and unrelated bindings: %s", async (source) => {
    expect(await messages(source)).toHaveLength(0);
  });

  it.each([
    "import { env } from 'node:process'; export type Env = typeof env;",
    "import { env } from 'node:process'; export type Env = typeof env.TOKEN;",
    "import type { env } from 'node:process'; export type Env = typeof env;",
    "import { type env } from 'node:process'; export type Env = typeof env.TOKEN;",
    "import * as p from 'node:process'; export type Env = typeof p.env;",
    "import { env } from 'node:process'; export function f(): typeof env { return {}; }",
    "import { env } from 'node:process'; export const x = {} satisfies typeof env;",
  ])("ignores erased environment references: %s", async (source) => {
    expect(await messages(source)).toHaveLength(0);
  });

  it.each([
    "export type process = string; export const x = process.env.TOKEN;",
    "export interface process { x: string }; export const x = process.env.TOKEN;",
    "export function f<process>() { return process.env.TOKEN; }",
    "import p from 'node:process'; export function f() { type p = string; return p.env.TOKEN; }",
    "import { env } from 'node:process'; export function f() { interface env { x: string }; return env.TOKEN; }",
    "import { env } from 'node:process'; export function f() { type env = string; return env.TOKEN; }",
  ])("resolves runtime values past type declarations: %s", async (source) => {
    expect(await messages(source)).toHaveLength(1);
  });

  it.each([
    "interface process { env: object }; const process = { env: {} }; process.env;",
    "import { env } from 'node:process'; function f(env: object) { type env = string; return env; }",
    "const process = { env: {} }; function f() { type process = string; return process.env; }",
    "import { env } from 'node:process'; function f() { const env = {}; function g() { interface env {}; return env; } return g(); }",
  ])("preserves real value shadowing alongside types: %s", async (source) => {
    expect(await messages(source)).toHaveLength(0);
  });

  it.each([
    "(process satisfies NodeJS.Process).env.TOKEN;",
    "(process.env satisfies NodeJS.ProcessEnv).TOKEN;",
    "import { env } from 'node:process'; (env satisfies NodeJS.ProcessEnv).TOKEN;",
    "(process.env satisfies NodeJS.ProcessEnv).TOKEN ||= 'x';",
    "((process.env as NodeJS.ProcessEnv) satisfies NodeJS.ProcessEnv).TOKEN ??= 'x';",
  ])("reports reads through satisfies: %s", async (source) => {
    expect(await messages(source)).toHaveLength(1);
  });

  it.each([
    "(process.env satisfies NodeJS.ProcessEnv).TOKEN = 'x';",
    "delete (process.env satisfies NodeJS.ProcessEnv).TOKEN;",
    "((process.env satisfies NodeJS.ProcessEnv).TOKEN satisfies string) = 'x';",
    "import { env } from 'node:process'; (env satisfies NodeJS.ProcessEnv).TOKEN = 'x';",
    "((process.env as NodeJS.ProcessEnv) satisfies NodeJS.ProcessEnv).TOKEN = 'x';",
  ])("allows writes through satisfies: %s", async (source) => {
    expect(await messages(source)).toHaveLength(0);
  });

  it.each([
    "import { 'default' as p } from 'node:process'; p.env.TOKEN;",
    "import { 'default' as p } from 'process'; p.env.TOKEN;",
    "import { 'env' as environment } from 'node:process'; environment.TOKEN;",
    "import { env } from 'node:process'; export type Env = typeof env; export const x = env.TOKEN;",
  ])("retains runtime import reads: %s", async (source) => {
    expect(await messages(source)).toHaveLength(1);
  });

  it.each([
    "import { 'default' as p } from './local.js'; p.env.TOKEN;",
    "import { 'default' as p } from 'node:process'; function f(p: { env: object }) { return p.env; }",
    "import { 'default' as p } from 'node:process'; p.env.TOKEN = 'x';",
    "import type { 'default' as p } from 'node:process'; export type Env = typeof p.env;",
  ])("preserves non-reading literal imports: %s", async (source) => {
    expect(await messages(source)).toHaveLength(0);
  });

  it.each([
    "src/bootstrap/environment.ts",
    "src/bootstrap/nested/environment.test.ts",
    "src/adapters/inbound/cli/input/prompt/index.ts",
    "src/adapters/inbound/cli/help/index.ts",
    "src/adapters/outbound/config/index.ts",
    "src/adapters/outbound/ledger/index.ts",
  ])("allows the approved path %s", async (file) => {
    expect(await messages("process.env.TOKEN;", file)).toHaveLength(0);
  });

  it.each([
    "src/bootstrap-other/environment.ts",
    "src/domain/bootstrap/environment.ts",
    "src/adapters/inbound/cli/input/prompt/neighbor.ts",
    "src/adapters/inbound/cli/help/index.test.ts",
    "src/adapters/outbound/config/neighbor.ts",
    "src/adapters/outbound/ledger/neighbor.ts",
    "src/domain/environment.test.ts",
    "test/environment.test.ts",
    "vitest.config.ts",
  ])("rejects a read outside the exact boundary: %s", async (file) => {
    expect(await messages("process.env.TOKEN;", file)).toHaveLength(1);
  });

  it("retains a global read outside a shadowed scope", async () => {
    expect(
      await messages("function f(process: object) { return process.env; } process.env.TOKEN;"),
    ).toHaveLength(1);
  });

  it("enforces new, increased and fixed counts with the real npm gate", () => {
    function write(file: string, source: string) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), source);
    }
    function run(script: string) {
      return spawnSync("npm", ["run", script], { cwd: dir, encoding: "utf8" });
    }
    const file = "src/application/services/environment.ts";
    const read = "export const value = process.env.TOKEN;\n";
    const clean = "export const value = 'fixed';\n";
    write(file, read);
    const baseline = run("lint:baseline");
    expect(baseline.status, baseline.stdout + baseline.stderr).toBe(0);
    const baselinePath = join(dir, "eslint-suppressions.json");
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({
      [file]: { [ruleId]: { count: 1 } },
    });
    expect(run("lint").status).toBe(0);
    write("src/domain/new.ts", read);
    expect(run("lint").status).toBe(1);
    write("src/domain/new.ts", clean);
    write(file, read + "export const second = process.env.OTHER;\n");
    const growth = run("lint");
    expect(growth.status).toBe(1);
    expect(growth.stdout).toContain(ruleId);
    write(file, clean);
    const fixed = run("lint");
    expect(fixed.status).toBe(2);
    expect(fixed.stderr).toContain("There are suppressions left that do not occur anymore");
    expect(run("lint:baseline").status).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({});
    expect(run("lint").status).toBe(0);
  });
});
