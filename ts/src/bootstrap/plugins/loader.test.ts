import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import { CapabilityRegistry } from "../../application/services/capability/index.js";
import type { InstalledPlugin, StoredPlugin } from "../../application/ports/plugin-store.js";
import { ErrorCodeTable } from "../../domain/errors/codes.js";
import { PLUGIN_API_REVISION, PLUGIN_API_VERSION } from "../../domain/plugins/index.js";
import type { HostServices } from "../../plugin-sdk/host-services.js";
import { PLUGIN_API_GLOBAL, PLUGIN_API_OBJECT } from "./api-object.js";
import { PluginLoader } from "./loader.js";
import type { PluginTargets } from "./host.js";
import { registerPluginSdkImports } from "./sdk-imports.js";

vi.mock("./sdk-imports.js", () => ({ registerPluginSdkImports: vi.fn() }));

const dir = mkdtempSync(join(tmpdir(), "wcli-loader-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A plugin module that registers one neutral command under each group.
function moduleSource(name: string, groups: string[], extra = "", register = ""): string {
  return `
    const api = globalThis[Symbol.for("wallet-cli.plugin-sdk")];
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
  opts: {
    groups?: string[];
    source?: string;
    apiRevision?: number;
    file?: string | null;
    credentials?: { key: string; summary: string }[];
  } = {},
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
    credentials: opts.credentials ?? [],
    entryPath,
    source: { type: "directory", path: "/x" },
    entrySha256: "",
    installedAt: "",
  };
  return { state: "installed", plugin: installed };
}

function setup(stored: StoredPlugin[], services = {} as HostServices) {
  const commands = new CommandRegistry();
  commands.add({ path: ["list"], run: async () => ({}) } as never);
  const targets: PluginTargets = {
    commands,
    capabilities: new CapabilityRegistry(),
    errorCodes: new ErrorCodeTable(),
    networks: [],
    services,
  };
  const importer = vi.fn((url: string) => import(url));
  const loader = new PluginLoader({ list: () => stored }, targets, importer);
  const warnings: string[] = [];
  return { loader, commands, importer, warn: (m: string) => warnings.push(m), warnings };
}

describe("PluginLoader", () => {
  it("imports no plugin for a core command, and lists installed groups from their manifests", async () => {
    vi.mocked(registerPluginSdkImports).mockClear();
    const t = setup([plugin("alpha"), plugin("beta")]);
    await t.loader.load({ all: false, word: "list" }, t.warn);
    expect(t.importer).not.toHaveBeenCalled();
    expect(registerPluginSdkImports).not.toHaveBeenCalled();
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

  it("publishes the API object and registers the SDK imports before the first import", async () => {
    const t = setup([plugin("alpha")]);
    await t.loader.load({ all: true }, t.warn);
    expect((globalThis as Record<symbol, unknown>)[PLUGIN_API_GLOBAL]).toBe(PLUGIN_API_OBJECT);
    const registered = vi.mocked(registerPluginSdkImports).mock.invocationCallOrder[0]!;
    expect(registered).toBeLessThan(t.importer.mock.invocationCallOrder[0]!);
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
    [
      "a definition getter that throws",
      {
        source: moduleSource("broken", ["broken"])
          .replace(
            "export default {",
            'export default { get groups() { throw new Error("getter boom"); },',
          )
          .replace(/groups: \[\{.*\}\],\n/, ""),
      },
      "definition could not be read (getter boom)",
    ],
    [
      "a group summary that differs from its manifest",
      { source: moduleSource("broken", ["broken"]).replace("broken cmds", "other text") },
      "does not match its manifest (groups)",
    ],
    [
      "group families that differ from its manifest",
      {
        source: moduleSource("broken", ["broken"]).replace('"families":[]', '"families":["tron"]'),
      },
      "does not match its manifest (groups)",
    ],
    [
      "a credential its manifest does not declare",
      {
        source: moduleSource("broken", ["broken"]).replace(
          "export default {",
          'export default { credentials: [{ key: "brokenApiKey", summary: "Broken key" }],',
        ),
      },
      "does not match its manifest (credentials)",
    ],
    [
      "a manifest credential the definition does not declare",
      { credentials: [{ key: "brokenApiKey", summary: "Broken key" }] },
      "does not match its manifest (credentials)",
    ],
    [
      "a credential summary that differs from its manifest",
      {
        credentials: [{ key: "brokenApiKey", summary: "Broken key" }],
        source: moduleSource("broken", ["broken"]).replace(
          "export default {",
          'export default { credentials: [{ key: "brokenApiKey", summary: "Other text" }],',
        ),
      },
      "does not match its manifest (credentials)",
    ],
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

describe("an installed plugin's credentials", () => {
  it("are the ones its manifest declares, whatever the module's getter returns later", async () => {
    const source = moduleSource("drift", ["drift"], "let reads = 0;", "").replace(
      "export default {",
      `export default {
      get credentials() {
        reads += 1;
        return reads === 1 ? undefined : [{ key: "otherApiKey", summary: "API key of another service" }];
      },`,
    );
    const register = `
      try { globalThis.driftRead = host.services.config.credential("otherApiKey"); }
      catch (error) { globalThis.driftRead = "refused: " + error.message; }`;
    const services = {
      config: {
        networkBlock: () => undefined,
        credential: (key: string) => (key === "otherApiKey" ? "fictional-other-key" : undefined),
      },
    } as unknown as HostServices;
    const t = setup(
      [
        plugin("drift", {
          source: source.replace("register(host) {", `register(host) {${register}`),
        }),
      ],
      services,
    );
    await t.loader.load({ all: true }, t.warn);
    expect(t.loader.state("drift")).toEqual({ state: "ok" });
    expect((globalThis as Record<string, unknown>).driftRead).toBe(
      "refused: plugin drift did not declare the credential otherApiKey",
    );
  });

  it("reads the module's list once for the comparison", async () => {
    const credentials = [{ key: "onceApiKey", summary: "Once key" }];
    const source = moduleSource("once", ["once"], "globalThis.onceReads = 0;").replace(
      "export default {",
      `export default {
      get credentials() {
        globalThis.onceReads += 1;
        return globalThis.onceReads === 1 ? ${JSON.stringify(credentials)} : undefined;
      },`,
    );
    const t = setup([plugin("once", { source, credentials })]);
    await t.loader.load({ all: true }, t.warn);
    expect(t.loader.state("once")).toEqual({ state: "ok" });
    expect((globalThis as Record<string, unknown>).onceReads).toBe(1);
  });
});
