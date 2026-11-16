import { homedir } from "node:os";
import path, { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePluginSource, registerPluginCommands } from "./plugin.js";
import { CommandRegistry } from "../registry/index.js";
import type {
  PluginListEntry,
  PluginService,
} from "../../../../application/use-cases/plugin-service.js";

describe("parsePluginSource", () => {
  it("reads paths as directories or archives and everything else as a registry spec", () => {
    expect(parsePluginSource("sunswap")).toEqual({ type: "registry", spec: "sunswap" });
    expect(parsePluginSource("@acme/thing@1.0.0")).toEqual({
      type: "registry",
      spec: "@acme/thing@1.0.0",
    });
    expect(parsePluginSource("./probe", "/work")).toEqual({
      type: "directory",
      path: "/work/probe",
    });
    expect(parsePluginSource("../p/probe-1.0.0.tgz", "/work/x")).toEqual({
      type: "archive",
      path: "/work/p/probe-1.0.0.tgz",
    });
    expect(parsePluginSource("/abs/probe.tar.gz")).toEqual({
      type: "archive",
      path: "/abs/probe.tar.gz",
    });
    expect(parsePluginSource("~/probe")).toEqual({
      type: "directory",
      path: join(homedir(), "probe"),
    });
  });

  it("reads native absolute paths, bare archive names and npm: specs", () => {
    expect(parsePluginSource("C:\\plugins\\demo", "D:\\work", path.win32)).toEqual({
      type: "directory",
      path: "C:\\plugins\\demo",
    });
    expect(parsePluginSource("demo.tgz", "D:\\work", path.win32)).toEqual({
      type: "archive",
      path: "D:\\work\\demo.tgz",
    });
    expect(parsePluginSource("demo-1.0.0.tar.gz", "/work")).toEqual({
      type: "archive",
      path: "/work/demo-1.0.0.tar.gz",
    });
    expect(parsePluginSource("npm:custom-plugin@1.0.0")).toEqual({
      type: "registry",
      spec: "npm:custom-plugin@1.0.0",
    });
  });
});

describe("plugin list text", () => {
  it("shows each plugin's source after its kind and leaves the integrity value to JSON", () => {
    const registry = new CommandRegistry();
    registerPluginCommands(registry, {} as PluginService);
    const list = registry.resolveNeutral(["plugin", "list"])!;
    const text = list.formatText!(
      [
        { name: "gasfree", version: "1.0.0", groups: ["gasfree"], kind: "builtin", state: "ok" },
        {
          name: "sunswap",
          version: "1.2.0",
          groups: ["sunswap"],
          kind: "installed",
          state: "ok",
          source: {
            type: "registry",
            spec: "@tron-walletcli/plugin-sunswap",
            registry: "https://registry.npmjs.org",
          },
          integrity: "sha512-abc",
        },
        {
          name: "qaprobe",
          version: "0.1.0",
          groups: ["qaprobe"],
          kind: "installed",
          state: "ok",
          source: { type: "directory", path: "/p/qaprobe" },
        },
        {
          name: "demo",
          version: "2.0.0",
          groups: ["demo"],
          kind: "installed",
          state: "ok",
          source: { type: "archive", path: "/p/demo-2.0.0.tgz" },
        },
      ] satisfies PluginListEntry[],
      {} as never,
    );
    expect((text as string).split("\n")).toEqual([
      "NAME     VERSION  KIND       SOURCE                                   STATE  COMMANDS",
      "gasfree  1.0.0    builtin    -                                        ok     gasfree",
      "sunswap  1.2.0    installed  registry @tron-walletcli/plugin-sunswap  ok     sunswap",
      "qaprobe  0.1.0    installed  directory /p/qaprobe                     ok     qaprobe",
      "demo     2.0.0    installed  archive /p/demo-2.0.0.tgz                ok     demo",
    ]);
    expect(text).not.toContain("sha512");
  });
});
