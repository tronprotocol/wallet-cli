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
const ruleId = "no-restricted-imports";
const capabilities = [
  ...["http", "https", "http2", "net", "tls"].flatMap((module) =>
    [module, `node:${module}`].flatMap((name) =>
      ["createServer", "Server", ...(module === "http2" ? ["createSecureServer"] : [])].map(
        (capability) => [name, capability],
      ),
    ),
  ),
  ["ws", "WebSocketServer"],
  ["ws", "Server"],
];
let dir: string;
let eslint: ESLint;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "wallet-cli-server-imports-"));
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

async function messages(source: string, file = "src/adapters/outbound/example.ts") {
  const [result] = await eslint.lintText(source, { filePath: join(dir, file) });
  expect(result!.fatalErrorCount).toBe(0);
  return result!.messages.filter((message) => message.ruleId === ruleId);
}

describe("server imports", () => {
  it.each(capabilities)("rejects the named capability %s:%s", async (module, capability) => {
    expect(await messages(`import { ${capability} } from '${module}';`)).toEqual([
      expect.objectContaining({
        severity: 2,
        messageId: "importNameWithCustomMessage",
        message: expect.stringContaining(`'${capability}' import from '${module}'`),
      }),
    ]);
  });

  it.each(capabilities)("rejects renamed capabilities %s:%s", async (module, capability) => {
    expect(await messages(`import { ${capability} as listener } from '${module}';`)).toHaveLength(
      1,
    );
  });

  it.each(capabilities)("allows declaration type imports %s:%s", async (module, capability) => {
    expect(
      await messages(`import type { ${capability} as Listener } from '${module}';`),
    ).toHaveLength(0);
  });

  it.each(capabilities)("allows inline type imports %s:%s", async (module, capability) => {
    expect(
      await messages(`import { type ${capability} as Listener } from '${module}';`),
    ).toHaveLength(0);
  });

  it.each([
    ["import { createServer, type Server } from 'node:http';", 1],
    ["import { createServer, Server } from 'node:http';", 2],
    ["import { createServer as a, createServer as b } from 'http';", 2],
    ["import { request, type Server } from 'node:http';", 0],
    ["import WebSocket, { type Server } from 'ws';", 0],
    ["import { 'createServer' as listener } from 'node:http';", 1],
    ["export { createSecureServer as listener } from 'node:http2';", 1],
    ["export { type Server, createServer } from 'node:https';", 1],
    ["export type { Server } from 'node:http';", 0],
    ["export type * from 'node:http';", 0],
  ])("counts only runtime restricted specifiers: %s", async (source, count) => {
    expect(await messages(source)).toHaveLength(count);
  });

  it.each([
    "src/adapters/inbound/server.ts",
    "src/adapters/inbound/http/server.ts",
    "src/adapters/outbound/x402/server.test.ts",
    "src/application/services/server.test.ts",
    "src/domain/server.test.ts",
    "src/bootstrap/server.test.ts",
    "test/lint/rules/server-imports.test.ts",
    "vitest.config.ts",
  ])("allows inbound, tests and tooling: %s", async (file) => {
    expect(
      await messages(
        "import { createServer } from 'node:http'; import { WebSocketServer } from 'ws';",
        file,
      ),
    ).toHaveLength(0);
  });

  it.each([
    "src/adapters/inbound-other/server.ts",
    "src/adapters/outbound/inbound/server.ts",
    "src/adapters/outbound/x402/server.ts",
    "src/application/services/server.ts",
    "src/domain/server.ts",
    "src/bootstrap/server.ts",
    "src/server.ts",
    "src/adapters/outbound/server.test-helper.ts",
  ])("rejects production outside inbound: %s", async (file) => {
    expect(
      await messages(
        "import { createServer } from 'node:http'; import { WebSocketServer } from 'ws';",
        file,
      ),
    ).toHaveLength(2);
  });

  it.each([
    "import { request, get, Agent, type IncomingMessage, type ServerResponse } from 'node:http';",
    "import { request as httpRequest, type IncomingMessage } from 'http';",
    "import { request as httpsRequest, get, Agent } from 'node:https';",
    "import { request } from 'https';",
    "import { connect, constants, type Http2Server, type Http2SecureServer } from 'node:http2';",
    "import { connect } from 'http2';",
    "import { BlockList, isIP, connect, createConnection, Socket, type LookupFunction } from 'node:net';",
    "import { connect } from 'net';",
    "import { connect, TLSSocket, createSecureContext, checkServerIdentity } from 'node:tls';",
    "import { connect } from 'tls';",
    "import WebSocket, { type ClientOptions, type RawData } from 'ws';",
    "import { WebSocket } from 'ws';",
    "import { request as createServer } from 'node:http';",
    "import { createServer, Server } from './local.js';",
  ])("allows outbound clients and unrelated names: %s", async (source) => {
    expect(await messages(source)).toHaveLength(0);
  });

  it.each(["http", "https", "http2", "net", "tls", "ws"])(
    "rejects namespaces without inspecting member usage: %s",
    async (module) => {
      expect(await messages(`import * as client from '${module}';`)).toEqual([
        expect.objectContaining({ messageId: "everythingWithCustomMessage" }),
      ]);
      expect(await messages(`import type * as types from '${module}';`)).toHaveLength(0);
    },
  );

  it.each([
    ["import * as http from 'node:http'; http.request('http://localhost');", 1],
    ["import * as ws from 'ws'; new ws.WebSocket('ws://localhost');", 1],
    ["export * from 'node:http';", 1],
    ["import http from 'node:http'; http.createServer();", 0],
    ["import { default as http } from 'http'; http.createServer();", 0],
    ["const { createServer } = await import('node:http');", 0],
    ["const { createServer } = require('node:http');", 0],
  ])("records stock import-rule limitations: %s", async (source, count) => {
    expect(await messages(source)).toHaveLength(count);
  });

  it("requires baseline removal after a fix and rejects new or increased counts", () => {
    function write(file: string, source: string) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), source);
    }
    function run(script: string) {
      return spawnSync("npm", ["run", script], { cwd: dir, encoding: "utf8" });
    }
    const file = "src/adapters/outbound/x402/server.ts";
    const source =
      "import { createServer, type Server } from 'node:http'; export { createServer, type Server };\n";
    const clean = "export const fixed = true;\n";
    write(file, source);
    const baseline = run("lint:baseline");
    expect(baseline.status, baseline.stdout + baseline.stderr).toBe(0);
    const baselinePath = join(dir, "eslint-suppressions.json");
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({
      [file]: { [ruleId]: { count: 1 } },
    });
    const known = run("lint");
    expect(known.status, known.stdout + known.stderr).toBe(0);
    write("src/adapters/outbound/new.ts", source);
    const added = run("lint");
    expect(added.status).toBe(1);
    expect(added.stdout).toContain(ruleId);
    write("src/adapters/outbound/new.ts", clean);
    write(file, source.replace("type Server", "Server"));
    const increased = run("lint");
    expect(increased.status).toBe(1);
    expect(increased.stdout).toContain(ruleId);
    write(file, clean);
    const fixed = run("lint");
    expect(fixed.status).toBe(2);
    expect(fixed.stderr).toContain("There are suppressions left that do not occur anymore");
    expect(run("lint:baseline").status).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({});
    expect(run("lint").status).toBe(0);
  });
});
