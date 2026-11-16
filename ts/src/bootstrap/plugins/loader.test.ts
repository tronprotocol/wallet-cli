import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import { FollowUpTable } from "../../adapters/inbound/cli/output/errors.js";
import { CapabilityRegistry } from "../../application/services/capability/index.js";
import type { InstalledPlugin, StoredPlugin } from "../../application/ports/plugin-store.js";
import { ErrorCodeTable } from "../../domain/errors/codes.js";
import { PLUGIN_API_REVISION, PLUGIN_API_VERSION } from "../../domain/plugins/index.js";
import type { HostServices } from "../../plugin-api/index.js";
import { PLUGIN_API_GLOBAL, PLUGIN_API_OBJECT } from "./api-object.js";
import { PluginLoader } from "./loader.js";
import type { PluginTargets } from "./host.js";

const dir = mkdtempSync(join(tmpdir(), "wcli-loader-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A plugin module that registers one neutral command under each group.
function moduleSource(name: string, groups: string[], extra = "", register = ""): string {
  return `
    const api = globalThis[Symbol.for("wallet-cli.plugin-api")];
    if (api === undefined) throw new Error("no host API");
    ${extra}
    export default {
      name: ${JSON.stringify(name)},
      version: "1.0.0",
      apiVersion: ${PLUGIN_API_VERSION},
      apiRevision: ${PLUGIN_API_REVISION},
      groups: ${JSON.stringify(groups.map((g) => ({ name: g, summary: `${g} cmds`, families: [] })))},
      register(host) {
        ${register}
        for (const g of ${JSON.stringify(groups)}) {
          host.command({ path: [g, "run"], network: "none", wallet: "none", auth: "none",
            fields: api.cli.z.object({}), input: api.cli.z.object({}), examples: [],
            run: async () => ({ ok: true }) });
        }
      },
    };`;
}

function plugin(
  name: string,
  opts: { groups?: string[]; source?: string; apiRevision?: number; file?: string | null } = {},
): StoredPlugin {
  const groups = opts.groups ?? [name];
  const entryPath = join(dir, `${name}-${Math.random().toString(36).slice(2)}.mjs`);
  if (opts.file !== null) writeFileSync(entryPath, opts.source ?? moduleSource(name, groups));
  const installed: InstalledPlugin = {
    name,
    version: "1.0.0",
    apiVersion: PLUGIN_API_VERSION,
    apiRevision: opts.apiRevision ?? PLUGIN_API_REVISION,
    groups: groups.map((g) => ({ name: g, summary: `${g} cmds`, families: [] })),
    entryPath,
    source: { type: "directory", path: "/x" },
    entrySha256: "",
    installedAt: "",
  };
  return { state: "installed", plugin: installed };
}

function setup(stored: StoredPlugin[]) {
  const commands = new CommandRegistry();
  commands.add({ path: ["list"], run: async () => ({}) } as never);
  const targets: PluginTargets = {
    commands,
    capabilities: new CapabilityRegistry(),
    errorCodes: new ErrorCodeTable(),
    followUps: new FollowUpTable(),
    networks: [],
    services: {} as HostServices,
    timeoutMs: 0,
  };
  const importer = vi.fn((url: string) => import(url));
  const loader = new PluginLoader({ list: () => stored }, targets, importer);
  const warnings: string[] = [];
  return { loader, commands, importer, warn: (m: string) => warnings.push(m), warnings };
}

describe("PluginLoader", () => {
  it("imports no plugin for a core command, and lists installed groups from their manifests", async () => {
    const t = setup([plugin("alpha"), plugin("beta")]);
    await t.loader.load({ all: false, word: "list" }, t.warn);
    expect(t.importer).not.toHaveBeenCalled();
    expect(t.commands.groups().map((g) => g.name)).toEqual(["alpha", "beta"]);
    expect(t.commands.resolveNeutral(["alpha", "run"])).toBeNull();
    expect(t.loader.owner("alpha")).toEqual({ name: "alpha", version: "1.0.0" });
  });

  it("imports only the plugin that owns the first word", async () => {
    const t = setup([plugin("alpha"), plugin("beta")]);
    await t.loader.load({ all: false, word: "beta" }, t.warn);
    expect(t.importer).toHaveBeenCalledTimes(1);
    expect(t.commands.resolveNeutral(["beta", "run"])).not.toBeNull();
    expect(
      t.commands
        .groups()
        .map((g) => g.name)
        .sort(),
    ).toEqual(["alpha", "beta"]);
  });

  it("publishes the API object before the first import", async () => {
    const t = setup([plugin("alpha")]);
    await t.loader.load({ all: true }, t.warn);
    expect((globalThis as Record<symbol, unknown>)[PLUGIN_API_GLOBAL]).toBe(PLUGIN_API_OBJECT);
    expect(t.loader.state("alpha")).toEqual({ state: "ok" });
  });

  it.each([
    ["an import failure", { source: 'throw new Error("boom");' }, "failed to load (boom)"],
    [
      "a definition that differs from its manifest",
      { source: moduleSource("other", ["broken"]) },
      "does not match its manifest (name)",
    ],
    [
      "a refused declaration",
      {
        source: moduleSource(
          "broken",
          ["broken"],
          "",
          'host.command({ path: ["tx", "x"], run: async () => ({}) });',
        ),
      },
      "registration failed",
    ],
    ["a missing entry file", { file: null }, "entry file is missing"],
  ])("marks a plugin broken on %s and publishes none of it", async (_label, opts, reason) => {
    const t = setup([plugin("broken", opts as never), plugin("healthy")]);
    await t.loader.load({ all: true }, t.warn);
    expect(t.loader.state("broken")).toEqual({
      state: "broken",
      reason: expect.stringContaining(reason),
    });
    expect(t.loader.owner("broken")?.failure).toMatchObject({ code: "plugin_load_failed" });
    expect(t.commands.resolveNeutral(["broken", "run"])).toBeNull();
    expect(t.commands.resolveNeutral(["healthy", "run"])).not.toBeNull();
    expect(t.warnings).toEqual([expect.stringContaining("plugin broken is broken")]);
  });

  it("does not import an incompatible plugin, and names the side to update", async () => {
    const t = setup([plugin("newer", { apiRevision: PLUGIN_API_REVISION + 1 })]);
    await t.loader.load({ all: false, word: "newer" }, t.warn);
    expect(t.importer).not.toHaveBeenCalled();
    expect(t.loader.state("newer")).toMatchObject({ state: "incompatible" });
    expect(t.loader.owner("newer")?.failure).toMatchObject({
      code: "plugin_incompatible",
      details: { plugin: "newer", update: "wallet-cli" },
    });
  });

  it("gives a contested group to the name that sorts first, and reports unreadable manifests", async () => {
    const t = setup([
      plugin("zeta", { groups: ["shared"] }),
      plugin("alpha", { groups: ["shared"] }),
      { state: "unreadable", name: "gamma", reason: "active.json is not JSON" },
    ]);
    await t.loader.load({ all: false, word: "shared" }, t.warn);
    expect(t.loader.owner("shared")?.name).toBe("alpha");
    expect(t.loader.state("zeta")).toEqual({
      state: "broken",
      reason: expect.stringContaining('"shared" is already taken'),
    });
    expect(t.loader.state("gamma")).toEqual({ state: "broken", reason: "active.json is not JSON" });
  });

  it("goes on without plugins when the store cannot be read", async () => {
    const commands = new CommandRegistry();
    const loader = new PluginLoader(
      {
        list: () => {
          throw new Error("EACCES");
        },
      },
      { commands } as unknown as PluginTargets,
    );
    const warnings: string[] = [];
    await loader.load({ all: true }, (m) => warnings.push(m));
    expect(warnings).toEqual(["installed plugins could not be read: EACCES"]);
  });
});
