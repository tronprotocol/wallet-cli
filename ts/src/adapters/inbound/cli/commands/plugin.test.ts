import { homedir } from "node:os";
import path, { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePluginSource } from "./plugin.js";

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
