import { describe, expect, it } from "vitest";
import { ESLint, RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import rule from "../../../eslint-rules/environment-reads.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const ruleId = "wallet-cli/environment-reads";
const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const eslint = new ESLint({ cwd: repo });

function reported(name: string, sources: string[]) {
  tester.run(name, rule, { valid: [], invalid: sources.map((code) => ({ code, errors: 1 })) });
}

function allowed(name: string, sources: string[]) {
  tester.run(name, rule, { valid: sources, invalid: [] });
}

// Runs the real config, so the path boundary is checked as well as the rule.
async function messages(source: string, file: string) {
  const [result] = await eslint.lintText(source, { filePath: join(repo, file) });
  expect(result!.fatalErrorCount).toBe(0);
  return result!.messages.filter((message) => message.ruleId === ruleId);
}

describe("environment reads", () => {
  reported("reports a read", [
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
  ]);

  allowed("allows writes and unrelated bindings", [
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
  ]);

  allowed("ignores erased environment references", [
    "import { env } from 'node:process'; export type Env = typeof env;",
    "import { env } from 'node:process'; export type Env = typeof env.TOKEN;",
    "import type { env } from 'node:process'; export type Env = typeof env;",
    "import { type env } from 'node:process'; export type Env = typeof env.TOKEN;",
    "import * as p from 'node:process'; export type Env = typeof p.env;",
    "import { env } from 'node:process'; export function f(): typeof env { return {}; }",
    "import { env } from 'node:process'; export const x = {} satisfies typeof env;",
  ]);

  reported("resolves runtime values past type declarations", [
    "export type process = string; export const x = process.env.TOKEN;",
    "export interface process { x: string }; export const x = process.env.TOKEN;",
    "export function f<process>() { return process.env.TOKEN; }",
    "import p from 'node:process'; export function f() { type p = string; return p.env.TOKEN; }",
    "import { env } from 'node:process'; export function f() { interface env { x: string }; return env.TOKEN; }",
    "import { env } from 'node:process'; export function f() { type env = string; return env.TOKEN; }",
  ]);

  allowed("preserves real value shadowing alongside types", [
    "interface process { env: object }; const process = { env: {} }; process.env;",
    "import { env } from 'node:process'; function f(env: object) { type env = string; return env; }",
    "const process = { env: {} }; function f() { type process = string; return process.env; }",
    "import { env } from 'node:process'; function f() { const env = {}; function g() { interface env {}; return env; } return g(); }",
  ]);

  reported("reports reads through satisfies", [
    "(process satisfies NodeJS.Process).env.TOKEN;",
    "(process.env satisfies NodeJS.ProcessEnv).TOKEN;",
    "import { env } from 'node:process'; (env satisfies NodeJS.ProcessEnv).TOKEN;",
    "(process.env satisfies NodeJS.ProcessEnv).TOKEN ||= 'x';",
    "((process.env as NodeJS.ProcessEnv) satisfies NodeJS.ProcessEnv).TOKEN ??= 'x';",
  ]);

  allowed("allows writes through satisfies", [
    "(process.env satisfies NodeJS.ProcessEnv).TOKEN = 'x';",
    "delete (process.env satisfies NodeJS.ProcessEnv).TOKEN;",
    "((process.env satisfies NodeJS.ProcessEnv).TOKEN satisfies string) = 'x';",
    "import { env } from 'node:process'; (env satisfies NodeJS.ProcessEnv).TOKEN = 'x';",
    "((process.env as NodeJS.ProcessEnv) satisfies NodeJS.ProcessEnv).TOKEN = 'x';",
  ]);

  reported("retains runtime import reads", [
    "import { 'default' as p } from 'node:process'; p.env.TOKEN;",
    "import { 'default' as p } from 'process'; p.env.TOKEN;",
    "import { 'env' as environment } from 'node:process'; environment.TOKEN;",
    "import { env } from 'node:process'; export type Env = typeof env; export const x = env.TOKEN;",
  ]);

  allowed("preserves non-reading literal imports", [
    "import { 'default' as p } from './local.js'; p.env.TOKEN;",
    "import { 'default' as p } from 'node:process'; function f(p: { env: object }) { return p.env; }",
    "import { 'default' as p } from 'node:process'; p.env.TOKEN = 'x';",
    "import type { 'default' as p } from 'node:process'; export type Env = typeof p.env;",
  ]);

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
    "src/adapters/outbound/config/neighbor.ts",
    "src/adapters/outbound/ledger/neighbor.ts",
  ])("rejects a read outside the exact boundary: %s", async (file) => {
    expect(await messages("process.env.TOKEN;", file)).toHaveLength(1);
  });

  it.each([
    "src/adapters/inbound/cli/help/index.test.ts",
    "src/domain/environment.test.ts",
    "test/environment.test.ts",
    "vitest.config.ts",
  ])("does not check tests and tooling: %s", async (file) => {
    expect(await messages("process.env.TOKEN;", file)).toHaveLength(0);
  });

  reported("retains a global read outside a shadowed scope", [
    "function f(process: object) { return process.env; } process.env.TOKEN;",
  ]);
});
