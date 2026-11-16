// The qaprobe fixture, installed into an empty home and run through the built CLI.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { run, seedWallet, testHome } from "./golden-harness.js";
import { buildQaprobe, packDirectory, type QaprobeVariant } from "./plugins/qaprobe.js";

const work = mkdtempSync(join(tmpdir(), "wcli-qaprobe-"));
const archives = new Map<QaprobeVariant, string>();
beforeAll(async () => {
  for (const variant of ["ok", "import-failure", "register-failure"] as const) {
    const dir = await buildQaprobe(join(work, variant), variant);
    archives.set(variant, packDirectory(dir, join(work, `${variant}.tgz`)));
  }
}, 60_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

// Commands that unlock the wallet pass `{ password: undefined }` to send the default password.
const json = (args: string[], opts: { password?: string | null } = { password: null }) =>
  run(["--output", "json", ...args], opts);

function install(variant: QaprobeVariant = "ok") {
  const r = json(["plugin", "install", archives.get(variant)!]);
  expect(r.json?.success, r.stdout + r.stderr).toBe(true);
}

// How often the installed entry file has been imported, as the fixture records it.
function imports(): number {
  const active = JSON.parse(readFileSync(join(testHome, "plugins/qaprobe/active.json"), "utf8"));
  const url = pathToFileURL(join(testHome, "plugins/qaprobe", active.entry)).href;
  const counter = join(
    tmpdir(),
    `qaprobe-imports-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
  );
  return existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
}

describe("an installed plugin", () => {
  it("serves its commands with meta.plugin, and keeps its own error code and exit", () => {
    install();
    const ok = json(["qaprobe", "read", "--value", "hello"]);
    expect(ok.status).toBe(0);
    expect(ok.json).toMatchObject({
      success: true,
      command: "qaprobe.read",
      data: { value: "hello" },
      meta: { plugin: { name: "qaprobe", version: "1.0.0" } },
    });
    const failed = json(["qaprobe", "read", "--value", "failure"]);
    expect(failed.status).toBe(2);
    expect(failed.json).toMatchObject({
      success: false,
      error: {
        code: "qaprobe_refused",
        message: "the probe refuses this value; try qaprobe read --value ok",
      },
      meta: { plugin: { name: "qaprobe", version: "1.0.0" } },
    });
    const core = json(["networks"]);
    expect(core.json.meta.plugin).toBeUndefined();
  });

  it("is described by --json-schema, with its error codes", () => {
    install();
    const r = run(["--json-schema"], { password: null });
    const catalog = JSON.parse(r.stdout);
    const ids = catalog.commands.map((c: { id: string }) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "qaprobe.read",
        "qaprobe.sign",
        "qaprobe.transfer",
        "qaprobe.inspect",
      ]),
    );
    expect(catalog.errorCodes.qaprobe_refused).toEqual({
      exit: 2,
      retry: "never",
      meaning: "the QA probe refused the value",
    });
  });

  it("is not imported by core commands or root help, which lists its group from the manifest", () => {
    install();
    const before = imports();
    expect(json(["networks"]).status).toBe(0);
    expect(json(["list"]).status).toBe(0);
    const help = run(["--help"], { password: null });
    expect(help.stdout).toMatch(/^ {2}qaprobe +QA probe commands/m);
    expect(imports()).toBe(before);
    expect(json(["qaprobe", "inspect"]).json.data.imports).toBe(before + 1);
  });

  it("signs a message exactly as message sign does", () => {
    seedWallet();
    install();
    const own = json(["message", "sign", "--message", "qaprobe", "--network", "nile"], {});
    const probe = json(["qaprobe", "sign", "--message", "qaprobe", "--network", "nile"], {});
    expect(probe.json?.success, probe.stdout + probe.stderr).toBe(true);
    expect(probe.json.data.signature).toBe(own.json.data.signature);
    expect(probe.json.data.address).toBe(own.json.data.address);
  });

  it("is stopped by the command deadline", () => {
    install();
    const r = json(["qaprobe", "read", "--value", "slow", "--timeout", "300"]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("timeout");
  });

  it("sees only the documented context, services and host members", () => {
    install();
    expect(json(["qaprobe", "inspect"]).json.data).toMatchObject({
      context: [
        "activeAccount",
        "deadline",
        "emit",
        "log",
        "output",
        "readStdinBytes",
        "resolveAddress",
        "timeoutMs",
        "wait",
        "warn",
      ],
      services: [
        "broadcastGuard",
        "clock",
        "config",
        "contracts",
        "gateways",
        "recipients",
        "signing",
      ],
      signing: ["assertCanSign", "sign", "signerAddress"],
      host: [
        "apiVersion",
        "capabilities",
        "chainCommand",
        "command",
        "errorCodes",
        "followUps",
        "services",
      ],
    });
  });
});

describe("a plugin that cannot be loaded", () => {
  it.each([
    ["import-failure", "failed to load (qaprobe failed while it was imported)"],
    ["register-failure", "registration failed"],
  ] as const)("is reported as broken after %s, and core commands still work", (variant, reason) => {
    install(variant);
    const r = json(["qaprobe", "read"]);
    expect(r.status).toBe(1);
    expect(r.json).toMatchObject({
      error: { code: "plugin_load_failed", message: expect.stringContaining(reason) },
      meta: { plugin: { name: "qaprobe", version: "1.0.0" } },
    });
    const list = json(["plugin", "list"]);
    expect(list.status).toBe(0);
    expect(list.json.data.find((p: { name: string }) => p.name === "qaprobe")).toMatchObject({
      state: "broken",
      reason: expect.stringContaining(reason),
    });
    expect(json(["networks"]).status).toBe(0);
    const schema = run(["--json-schema"], { password: null });
    expect(schema.status).toBe(0);
    expect(schema.stderr).toContain("plugin qaprobe is broken");
    expect(
      JSON.parse(schema.stdout).commands.some((c: { id: string }) => c.id.startsWith("qaprobe.")),
    ).toBe(false);
  });

  it("is reported as incompatible when its manifest needs a newer wallet-cli", () => {
    install();
    const path = join(testHome, "plugins/qaprobe/active.json");
    const active = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...active, apiRevision: active.apiRevision + 1 }));
    const r = json(["qaprobe", "read"]);
    expect(r.status).toBe(1);
    expect(r.json.error).toMatchObject({
      code: "plugin_incompatible",
      details: { plugin: "qaprobe", update: "wallet-cli" },
    });
    expect(json(["plugin", "list"]).json.data[1]).toMatchObject({ state: "incompatible" });
  });
});
