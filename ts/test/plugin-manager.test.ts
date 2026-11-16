// plugin install / list / update / remove against a registry stub served from this process and
// local sources. The CLI runs asynchronously so the stub can answer it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testHome } from "./golden-harness.js";
import { buildQaprobe, packDirectory, type QaprobeVariant } from "./plugins/qaprobe.js";

const ENTRY = process.env.WALLET_CLI_TEST_ENTRY!;
const PACKAGE = "@tron-walletcli/plugin-qaprobe";
const work = mkdtempSync(join(tmpdir(), "wcli-plugin-manager-"));
const dirs = new Map<string, string>();
const tarballs = new Map<string, Buffer>();
let server: Server;
let registry: string;
// What the stub publishes; tests change it.
let latest = "1.0.0";
let tampered = false;

const sha512 = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

beforeAll(async () => {
  const builds: [string, QaprobeVariant, string][] = [
    ["1.0.0", "ok", "1.0.0"],
    ["1.1.0", "ok", "1.1.0"],
    ["conflict", "conflict", "1.0.0"],
    ["api-version", "api-version", "1.0.0"],
  ];
  for (const [key, variant, version] of builds) {
    const dir = await buildQaprobe(join(work, key), variant, version);
    dirs.set(key, dir);
    tarballs.set(key, readFileSync(packDirectory(dir, join(work, `${key}.tgz`))));
  }
  server = createServer((req, res) => {
    const url = req.url ?? "";
    const tarball = /^\/files\/(.+)\.tgz$/.exec(url)?.[1];
    if (tarball !== undefined && tarballs.has(tarball)) {
      res.end(
        tampered
          ? Buffer.concat([tarballs.get(tarball)!, Buffer.from([0])])
          : tarballs.get(tarball),
      );
      return;
    }
    if (url !== `/${PACKAGE.replace("/", "%2F")}`) {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    const versions = Object.fromEntries(
      ["1.0.0", "1.1.0"].map((v) => [
        v,
        {
          name: PACKAGE,
          version: v,
          dist: { tarball: `${registry}/files/${v}.tgz`, integrity: sha512(tarballs.get(v)!) },
        },
      ]),
    );
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ name: PACKAGE, "dist-tags": { latest }, versions }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

async function cli(args: string[]) {
  const child = spawn(process.execPath, [ENTRY, "--output", "json", ...args], {
    env: { ...process.env, WALLET_CLI_HOME: testHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const status = await new Promise<number | null>((resolve) => child.on("close", resolve));
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    /* not JSON */
  }
  return { status, stdout, stderr, json };
}

async function useStub() {
  latest = "1.0.0";
  tampered = false;
  expect((await cli(["config", "pluginRegistry", registry])).status).toBe(0);
}

const installed = async () =>
  (await cli(["plugin", "list"])).json.data
    .filter((p: { kind: string }) => p.kind === "installed")
    .map((p: { name: string; version: string }) => `${p.name}@${p.version}`);

describe("plugin install from a registry", () => {
  it("installs by short name after checking integrity, and lists the record", async () => {
    await useStub();
    const r = await cli(["plugin", "install", "qaprobe"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.data).toMatchObject({
      name: "qaprobe",
      version: "1.0.0",
      source: { type: "registry", spec: PACKAGE, registry },
      integrity: sha512(tarballs.get("1.0.0")!),
      notice: expect.stringContaining("wallet's privileges"),
    });
    const listed = (await cli(["plugin", "list"])).json.data.find(
      (p: { name: string }) => p.name === "qaprobe",
    );
    expect(listed).toMatchObject({
      name: "qaprobe",
      version: "1.0.0",
      apiVersion: 1,
      apiRevision: 1,
      groups: ["qaprobe"],
      kind: "installed",
      state: "ok",
      source: { type: "registry", spec: PACKAGE, registry },
      integrity: sha512(tarballs.get("1.0.0")!),
      installedAt: expect.any(String),
    });
  });

  it("refuses a download that does not match the registry's integrity value, storing nothing", async () => {
    await useStub();
    tampered = true;
    const r = await cli(["plugin", "install", "qaprobe"]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("plugin_integrity");
    expect(await installed()).toEqual([]);
  });

  it("reports a missing version as not_found and an unreachable registry as a transport error", async () => {
    await useStub();
    expect((await cli(["plugin", "install", "qaprobe@9.9.9"])).json.error.code).toBe("not_found");
    expect((await cli(["plugin", "install", "@acme/missing"])).json.error.code).toBe("not_found");
    await cli(["config", "pluginRegistry", "http://127.0.0.1:9"]);
    const unreachable = await cli(["plugin", "install", "qaprobe"]);
    expect(unreachable.status).toBe(1);
    expect(unreachable.json.error.code).toBe("provider_error");
  });

  it("moves an unpinned install to the newest version and leaves a pinned one", async () => {
    await useStub();
    await cli(["plugin", "install", "qaprobe"]);
    expect((await cli(["plugin", "update"])).json.data).toEqual([
      { name: "qaprobe", status: "unchanged", version: "1.0.0" },
    ]);
    latest = "1.1.0";
    expect((await cli(["plugin", "update", "qaprobe"])).json.data).toEqual([
      { name: "qaprobe", status: "updated", from: "1.0.0", to: "1.1.0" },
    ]);
    expect((await cli(["qaprobe", "read"])).json.meta.plugin).toEqual({
      name: "qaprobe",
      version: "1.1.0",
    });
    await cli(["plugin", "remove", "qaprobe"]);
    await cli(["plugin", "install", "qaprobe@1.0.0"]);
    expect((await cli(["plugin", "update", "qaprobe"])).json.data).toEqual([
      { name: "qaprobe", status: "unchanged", version: "1.0.0" },
    ]);
  });
});

describe("plugin install from local sources", () => {
  it("installs a directory, refuses a second install, and removes it", async () => {
    const dir = await cli(["plugin", "install", dirs.get("1.0.0")!]);
    expect(dir.json.data.source).toEqual({ type: "directory", path: dirs.get("1.0.0") });
    const again = await cli(["plugin", "install", join(work, "1.1.0.tgz")]);
    expect(again.status).toBe(2);
    expect(again.json.error).toMatchObject({
      code: "plugin_conflict",
      message: expect.stringContaining("plugin update qaprobe"),
    });
    expect((await cli(["plugin", "remove", "qaprobe"])).json.data).toEqual({
      name: "qaprobe",
      version: "1.0.0",
      removed: true,
    });
    const gone = await cli(["qaprobe", "read"]);
    expect(gone.status).toBe(2);
    expect(gone.json.error.code).toBe("unknown_command");
  });

  it("refuses a group another installed plugin holds, and an unsupported API version", async () => {
    await cli(["plugin", "install", join(work, "1.0.0.tgz")]);
    const taken = await cli(["plugin", "install", join(work, "conflict.tgz")]);
    expect(taken.status).toBe(2);
    expect(taken.json.error).toMatchObject({
      code: "plugin_conflict",
      message: expect.stringContaining("installed plugin qaprobe"),
    });
    const incompatible = await cli(["plugin", "install", join(work, "api-version.tgz")]);
    expect(incompatible.status).toBe(1);
    expect(incompatible.json.error.code).toBe("plugin_incompatible");
    expect(await installed()).toEqual(["qaprobe@1.0.0"]);
  });

  it("refuses to update or remove a built-in or a missing plugin", async () => {
    expect((await cli(["plugin", "remove", "gasfree"])).json.error.code).toBe("plugin_conflict");
    expect((await cli(["plugin", "update", "gasfree"])).json.error.code).toBe("plugin_conflict");
    const missing = await cli(["plugin", "remove", "qaprobe"]);
    expect(missing.status).toBe(2);
    expect(missing.json.error.code).toBe("plugin_not_installed");
  });

  it("states the trust notice in the install help", async () => {
    const child = await cli(["plugin", "install", "--help"]);
    expect(child.stdout).toContain("Plugins run inside wallet-cli with the wallet's privileges");
  });
});
