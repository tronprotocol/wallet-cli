import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilePluginStore } from "../../adapters/outbound/plugins/store.js";
import { AtomicFileStore } from "../../adapters/outbound/persistence/fs/index.js";
import type { PluginPackage, PluginSource } from "../ports/plugin-source.js";
import type { ExecutionDeadline } from "../contracts/deadline.js";
import { PLUGIN_API_REVISION, PLUGIN_API_VERSION } from "../../domain/plugins/index.js";
import { PLUGIN_TRUST_NOTICE, PluginService, type PluginInstallSource } from "./plugin-service.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wcli-plugin-service-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const DEADLINE: ExecutionDeadline = {
  signal: new AbortController().signal,
  remainingMs: () => Infinity,
  expired: () => false,
  assertActive: () => {},
};

interface Spec {
  name?: string;
  version?: string;
  groups?: string[];
  apiVersion?: number;
  apiRevision?: number;
  entry?: string | null;
}

function pkg(
  spec: Spec = {},
  source: PluginPackage["source"] = { type: "directory", path: "/p" },
): PluginPackage {
  const entry =
    spec.entry === undefined
      ? `export default ${JSON.stringify(spec.version ?? "1.0.0")};`
      : spec.entry;
  return {
    packageJson: {
      name: "pkg",
      version: spec.version ?? "1.0.0",
      walletCli: {
        plugin: {
          name: spec.name ?? "demo",
          apiVersion: spec.apiVersion ?? PLUGIN_API_VERSION,
          apiRevision: spec.apiRevision ?? PLUGIN_API_REVISION,
          entry: "dist/index.mjs",
          groups: (spec.groups ?? ["demo"]).map((name) => ({ name, summary: "S", families: [] })),
        },
      },
    },
    file: (path) => (path === "dist/index.mjs" && entry !== null ? Buffer.from(entry) : undefined),
    source,
  };
}

function setup(packages: Record<string, () => PluginPackage | Promise<PluginPackage>>) {
  const source: PluginSource = {
    fromRegistry: vi.fn(async (_registry, spec) => packages[`registry:${spec.name}`]!()),
    fromDirectory: vi.fn((path: string) => ({
      ...(packages[path]!() as PluginPackage),
      source: { type: "directory" as const, path },
    })),
    fromArchive: vi.fn((path: string) => packages[path]!() as PluginPackage),
  };
  const store = new FilePluginStore(home, new AtomicFileStore());
  const service = new PluginService(
    store,
    source,
    {
      builtins: [
        { name: "gasfree", version: "1.0.0", apiVersion: 1, apiRevision: 1, groups: ["gasfree"] },
      ],
      reservedWords: new Set(["tx", "plugin", "tron"]),
      loadState: () => undefined,
    },
    () => Date.UTC(2026, 10, 17),
  );
  return { service, source, store };
}

const dir = (path: string): PluginInstallSource => ({ type: "directory", path });

describe("PluginService.install", () => {
  it("stores the package and returns the trust notice", async () => {
    const { service } = setup({ "/p": () => pkg() });
    const result = await service.install(dir("/p"), "", DEADLINE);
    expect(result).toMatchObject({
      name: "demo",
      version: "1.0.0",
      groups: ["demo"],
      notice: PLUGIN_TRUST_NOTICE,
    });
    expect(service.list().map((e) => [e.name, e.kind, e.state])).toEqual([
      ["gasfree", "builtin", "ok"],
      ["demo", "installed", "ok"],
    ]);
  });

  it.each([
    [
      "an installed name",
      { name: "demo", groups: ["other"] },
      "plugin_conflict",
      "plugin update demo",
    ],
    ["a reserved group", { name: "x", groups: ["tx"] }, "plugin_conflict", '"tx"'],
    ["a built-in group", { name: "x", groups: ["gasfree"] }, "plugin_conflict", '"gasfree"'],
    ["a built-in name", { name: "gasfree", groups: ["y"] }, "plugin_conflict", "built-in"],
    [
      "a newer API revision",
      { name: "x", groups: ["y"], apiRevision: PLUGIN_API_REVISION + 1 },
      "plugin_incompatible",
      "",
    ],
    [
      "another API version",
      { name: "x", groups: ["y"], apiVersion: PLUGIN_API_VERSION + 1 },
      "plugin_incompatible",
      "",
    ],
    ["a missing entry", { name: "x", groups: ["y"], entry: null }, "plugin_invalid", "entry file"],
  ])("refuses %s", async (_label, spec, code, text) => {
    const { service } = setup({ "/p": () => pkg(), "/q": () => pkg(spec as Spec) });
    await service.install(dir("/p"), "", DEADLINE);
    await expect(service.install(dir("/q"), "", DEADLINE)).rejects.toMatchObject({
      code,
      message: expect.stringContaining(text),
    });
    expect(
      service
        .list()
        .filter((e) => e.kind === "installed")
        .map((e) => e.name),
    ).toEqual(["demo"]);
  });

  it("lets only one of two concurrent installs claim a group", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { service } = setup({
      "registry:@tron-walletcli/plugin-first": async () => {
        await gate;
        return pkg({ name: "first", groups: ["shared"] });
      },
      "registry:@tron-walletcli/plugin-second": async () => {
        await gate;
        return pkg({ name: "second", groups: ["shared"] });
      },
    });
    const first = service.install({ type: "registry", spec: "first" }, "https://r", DEADLINE);
    const second = service.install({ type: "registry", spec: "second" }, "https://r", DEADLINE);
    release();
    const results = await Promise.allSettled([first, second]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({
      code: "plugin_conflict",
      message: expect.stringContaining("installed plugin first"),
    });
  });
});

describe("PluginService.update and remove", () => {
  it("updates from the recorded source and reports unchanged when nothing changed", async () => {
    let version = "1.0.0";
    const { service } = setup({ "/p": () => pkg({ version }) });
    await service.install(dir("/p"), "", DEADLINE);
    expect(await service.update("demo", DEADLINE)).toEqual([
      { name: "demo", status: "unchanged", version: "1.0.0" },
    ]);
    version = "1.1.0";
    expect(await service.update(undefined, DEADLINE)).toEqual([
      { name: "demo", status: "updated", from: "1.0.0", to: "1.1.0" },
    ]);
  });

  it("does not fetch a registry package pinned to an exact version", async () => {
    const { service, source } = setup({
      "registry:@tron-walletcli/plugin-demo": () =>
        pkg(
          {},
          { type: "registry", spec: "@tron-walletcli/plugin-demo@1.0.0", registry: "https://r" },
        ),
    });
    await service.install({ type: "registry", spec: "demo@1.0.0" }, "https://r", DEADLINE);
    expect(await service.update("demo", DEADLINE)).toEqual([
      { name: "demo", status: "unchanged", version: "1.0.0" },
    ]);
    expect(source.fromRegistry).toHaveBeenCalledTimes(1);
  });

  it("tries every plugin and fails with the first failure and every result", async () => {
    let broken = false;
    const { service } = setup({
      "/a": () => pkg({ name: "alpha", groups: ["alpha"] }),
      "/b": () =>
        broken
          ? pkg({ name: "beta", groups: ["beta"], entry: null })
          : pkg({ name: "beta", groups: ["beta"] }),
    });
    await service.install(dir("/a"), "", DEADLINE);
    await service.install(dir("/b"), "", DEADLINE);
    broken = true;
    await expect(service.update(undefined, DEADLINE)).rejects.toMatchObject({
      code: "plugin_invalid",
      details: {
        results: [
          { name: "alpha", status: "unchanged", version: "1.0.0" },
          { name: "beta", status: "failed", code: "plugin_invalid", message: expect.any(String) },
        ],
      },
    });
  });

  it("refuses a built-in plugin and a name that is not installed", async () => {
    const { service } = setup({});
    expect(() => service.remove("gasfree")).toThrow(
      expect.objectContaining({ code: "plugin_conflict" }),
    );
    await expect(service.update("gasfree", DEADLINE)).rejects.toMatchObject({
      code: "plugin_conflict",
    });
    expect(() => service.remove("demo")).toThrow(
      expect.objectContaining({ code: "plugin_not_installed" }),
    );
    await expect(service.update("demo", DEADLINE)).rejects.toMatchObject({
      code: "plugin_not_installed",
    });
  });

  it("updates nothing when nothing is installed, and removes an installed plugin", async () => {
    const { service } = setup({ "/p": () => pkg() });
    expect(await service.update(undefined, DEADLINE)).toEqual([]);
    await service.install(dir("/p"), "", DEADLINE);
    expect(service.remove("demo")).toEqual({ name: "demo", version: "1.0.0", removed: true });
    expect(service.list().map((e) => e.name)).toEqual(["gasfree"]);
  });
});
