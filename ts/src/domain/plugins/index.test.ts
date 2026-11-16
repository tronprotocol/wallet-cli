import { describe, expect, it } from "vitest";
import {
  isPackagePath,
  isPinned,
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
  ])("refuses %s", (_label, pkg) => {
    expect(() => parsePluginManifest(pkg as never)).toThrow(
      expect.objectContaining({ code: "plugin_invalid" }),
    );
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
});

describe("isPackagePath", () => {
  it("accepts only normalized relative paths", () => {
    expect(isPackagePath("dist/index.mjs")).toBe(true);
    for (const bad of ["", "/abs", "a/../b", "./a", "a//b", "a\\b", "C:/x"]) {
      expect(isPackagePath(bad)).toBe(false);
    }
  });
});
