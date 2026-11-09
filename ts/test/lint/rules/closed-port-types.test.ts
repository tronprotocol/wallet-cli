import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
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
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const ruleId = "wallet-cli/closed-port-types";
// A line ending in this marker must be reported; no other line may be.
const marker = "// reported";

const fixtures: Record<string, string> = {
  "src/domain/typed/index.ts": `
export interface Payload {
  domain: { [field: string]: unknown };
}
export type Hidden = Inner;
type Inner = { value: unknown };
export type Shown = string | number | Shown[] | { [field: string]: Shown };
`,
  "src/domain/types/index.ts": `
export type { Payload, Shown } from "../typed/index.js";
export type Leaf = unknown; ${marker}
export type Chain = Middle;
type Middle = Leaf;
export interface Tree {
  name?: string | null;
  children: Tree[];
  kind: "a" | "b";
}
export type Json = string | number | boolean | null | Json[] | { readonly [field: string]: Json };
export interface Fields {
  readonly [field: string]: string;
}
export interface OpenFields {
  readonly [field: string]: unknown; ${marker}
}
export function endpointHost(url: unknown): string {
  return String(url);
}
`,
  "src/application/contracts/signer.ts": `
import type { Payload } from "../../domain/types/index.js";
export interface Signer {
  sign(payload: Payload): Promise<string>; ${marker}
  verify(): unknown;
}
export interface Unused {
  value: unknown;
}
`,
  "src/application/ports/reader.ts": `
import type { Chain, Fields, Json, OpenFields, Payload, Shown, Tree } from "../../domain/types/index.js";
import type { Hidden } from "../../domain/typed/index.js";
import type { Signer } from "../contracts/signer.js";
type NetworkId = "mainnet" | "nile";
export interface Request {
  args: unknown[];
}
export interface Reader {
  one(): unknown; ${marker}
  many(): Promise<Array<{ data: Record<string, unknown> }>>; ${marker}
  either(): any; ${marker}
  chain(): Chain;
  imported(): Payload; ${marker}
  hidden(): Hidden; ${marker}
  watch(onEvent: (event: { body: unknown }) => void): void; ${marker}
  pay(signer: Signer): void;
  write(value: unknown, request: Request): void;
  update<T>(change: () => { document: unknown; result: T }): T;
  json(): Json;
  shown(): Shown;
  fields(): Fields;
  openFields(): OpenFields;
  literal(): { [field: string]: number };
  closed(): {
    byNetwork: Record<NetworkId, Tree>;
    byId: ReadonlyMap<string, readonly Tree[]>;
    partial?: Partial<Record<string, string>>;
  };
  select<T>(choices: readonly T[], signal: AbortSignal): Promise<T>;
  bytes(): Uint8Array;
}
`,
  "src/application/services/outside.ts": `
export interface Outside {
  read(): unknown;
}
`,
};

let dir: string;
let eslint: ESLint;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "wallet-cli-closed-port-types-"));
  symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));
  for (const file of [
    "eslint.config.js",
    "package.json",
    "scripts/lint.mjs",
    "eslint-rules/closed-port-types.mjs",
    "eslint-rules/environment-reads.mjs",
  ]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    copyFileSync(join(repo, file), join(dir, file));
  }
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        noEmit: true,
      },
      include: ["src"],
    }),
  );
  for (const [file, source] of Object.entries(fixtures)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), source.trimStart());
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
  eslint = new ESLint({ cwd: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("closed port types", () => {
  it("reports open values that reach the inside and nothing else", async () => {
    const lines: string[] = [];
    for (const result of await eslint.lintFiles(["src"])) {
      expect(result.fatalErrorCount).toBe(0);
      const source = readFileSync(result.filePath, "utf8").split("\n");
      for (const message of result.messages.filter((message) => message.ruleId === ruleId)) {
        lines.push(`${relative(dir, result.filePath)}: ${source[message.line - 1]!.trim()}`);
      }
    }
    const marked = Object.entries(fixtures).flatMap(([file, source]) =>
      source
        .trimStart()
        .split("\n")
        .filter((line) => line.endsWith(marker))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(lines.sort()).toEqual(marked.sort());
  });

  it("reports each open leaf once with what it found", async () => {
    const [result] = await eslint.lintFiles(["src/application/ports/reader.ts"]);
    const messages = result!.messages.filter((message) => message.ruleId === ruleId);
    expect(messages.map((message) => message.message)).toEqual([
      "Open type crosses a port inward: unknown.",
      "Open type crosses a port inward: unknown.",
      "Open type crosses a port inward: any.",
      "Open type crosses a port inward: Payload (unknown).",
      "Open type crosses a port inward: Hidden (unknown).",
      "Open type crosses a port inward: unknown.",
    ]);
  });
});
