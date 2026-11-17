import { describe, expect, it } from "vitest";
import {
  isPackagePath,
  formatRegistrySpec,
  isPinned,
  mergeCredentials,
  parsePluginManifest,
  parseRegistrySpec,
  pluginCompatibility,
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
} from "./index.js";

const manifest = (plugin: object, version = "1.0.0") => ({
  name: "@x/plugin-demo",
  version,
  walletCli: {
    plugin: {
      name: "demo",
      apiVersion: 1,
      apiRevision: 1,
      entry: "dist/index.mjs",
      groups: [{ name: "demo", summary: "Demo", families: ["tron"] }],
      ...plugin,
    },
  },
});

describe("parsePluginManifest", () => {
  it("reads the walletCli.plugin manifest", () => {
    expect(parsePluginManifest(manifest({}))).toEqual({
      name: "demo",
      version: "1.0.0",
      apiVersion: 1,
      apiRevision: 1,
      entry: "dist/index.mjs",
      groups: [{ name: "demo", summary: "Demo", families: ["tron"] }],
      credentials: [],
    });
  });

  it.each([
    ["no manifest", { walletCli: {} }],
    ["a bad name", manifest({ name: "Demo" })],
    ["an entry outside the package", manifest({ entry: "../index.mjs" })],
    ["an entry that is not a module", manifest({ entry: "dist/index.ts" })],
    ["no groups", manifest({ groups: [] })],
    [
      "a repeated group",
      manifest({
        groups: [
          { name: "a", summary: "A", families: [] },
          { name: "a", summary: "A", families: [] },
        ],
      }),
    ],
    ["an unknown family", manifest({ groups: [{ name: "a", summary: "A", families: ["btc"] }] })],
    ["a version that is not semver", manifest({}, "1.0")],
    ["credentials that are not a list", manifest({ credentials: { key: "demoKey" } })],
    ["a credential that is not an object", manifest({ credentials: ["demoKey"] })],
    ["a credential key with a dot", manifest({ credentials: [{ key: "demo.key", summary: "S" }] })],
    [
      "a credential key in upper case",
      manifest({ credentials: [{ key: "DemoKey", summary: "S" }] }),
    ],
    ["a credential without a summary", manifest({ credentials: [{ key: "demoKey" }] })],
    ["a blank credential summary", manifest({ credentials: [{ key: "demoKey", summary: " " }] })],
    [
      "a credential summary of two lines",
      manifest({ credentials: [{ key: "demoKey", summary: "one\ntwo" }] }),
    ],
    [
      "a repeated credential key",
      manifest({
        credentials: [
          { key: "demoKey", summary: "A" },
          { key: "demoKey", summary: "B" },
        ],
      }),
    ],
  ])("refuses %s", (_label, pkg) => {
    expect(() => parsePluginManifest(pkg as never)).toThrow(
      expect.objectContaining({ code: "plugin_invalid" }),
    );
  });
});

describe("plugin credentials", () => {
  it.each(["timeoutMs", "networks", "price", "tronlinkSecretId", "tronlinkChannel"])(
    "refuses the core key %s as a credential",
    (key) => {
      expect(() =>
        parsePluginManifest(manifest({ credentials: [{ key, summary: "S" }] }) as never),
      ).toThrow(expect.objectContaining({ code: "plugin_invalid" }));
    },
  );

  it("reads the declared keys and summaries", () => {
    const credentials = [{ key: "demoApiKey", summary: "Demo API key" }];
    expect(parsePluginManifest(manifest({ credentials }))).toMatchObject({ credentials });
  });

  it("lists a key several plugins declare once, with the first summary", () => {
    expect(
      mergeCredentials([
        [{ key: "sharedKey", summary: "first" }],
        [
          { key: "sharedKey", summary: "second" },
          { key: "ownKey", summary: "own" },
        ],
      ]),
    ).toEqual([
      { key: "sharedKey", summary: "first" },
      { key: "ownKey", summary: "own" },
    ]);
  });
});

describe("pluginCompatibility", () => {
  it("names the side that must be updated", () => {
    expect(pluginCompatibility(PLUGIN_API_VERSION, PLUGIN_API_REVISION)).toEqual({
      compatible: true,
    });
    expect(pluginCompatibility(PLUGIN_API_VERSION, 0)).toEqual({ compatible: true });
    expect(pluginCompatibility(PLUGIN_API_VERSION, PLUGIN_API_REVISION + 1)).toMatchObject({
      update: "wallet-cli",
    });
    expect(pluginCompatibility(PLUGIN_API_VERSION + 1, 0)).toMatchObject({ update: "wallet-cli" });
    expect(pluginCompatibility(PLUGIN_API_VERSION - 1, 0)).toMatchObject({ update: "plugin" });
  });
});

describe("parseRegistrySpec", () => {
  it.each([
    ["sunswap", { name: "@tron-walletcli/plugin-sunswap" }],
    ["sunswap@1.2.0", { name: "@tron-walletcli/plugin-sunswap", version: "1.2.0" }],
    ["@acme/thing@beta", { name: "@acme/thing", version: "beta" }],
    ["@acme/thing", { name: "@acme/thing" }],
  ])("reads %s", (spec, expected) => {
    expect(parseRegistrySpec(spec)).toEqual(expected);
  });

  it("refuses ranges and bad names; only an exact version is pinned", () => {
    expect(() => parseRegistrySpec("demo@^1.0.0")).toThrow(/ranges are not supported/);
    expect(() => parseRegistrySpec("Bad Name")).toThrow(/not a package name/);
    expect(isPinned(parseRegistrySpec("demo@1.0.0"))).toBe(true);
    expect(isPinned(parseRegistrySpec("demo@latest"))).toBe(false);
    expect(isPinned(parseRegistrySpec("demo"))).toBe(false);
  });

  it("takes an npm: spec as the exact package name, and formats a spec so it parses back", () => {
    expect(parseRegistrySpec("npm:custom-plugin@1.0.0")).toEqual({
      name: "custom-plugin",
      version: "1.0.0",
    });
    expect(parseRegistrySpec("npm:@acme/thing")).toEqual({ name: "@acme/thing" });
    for (const text of ["demo@1.0.0", "npm:custom-plugin", "@acme/thing@beta", "npm:x.y@2.0.0"]) {
      const spec = parseRegistrySpec(text);
      expect(parseRegistrySpec(formatRegistrySpec(spec))).toEqual(spec);
    }
    expect(formatRegistrySpec(parseRegistrySpec("npm:custom-plugin"))).toBe("npm:custom-plugin");
  });
});

describe("isPackagePath", () => {
  it("accepts only normalized relative paths", () => {
    expect(isPackagePath("dist/index.mjs")).toBe(true);
    for (const bad of ["", "/abs", "a/../b", "./a", "a//b", "a\\b", "C:/x"]) {
      expect(isPackagePath(bad)).toBe(false);
    }
  });
});
