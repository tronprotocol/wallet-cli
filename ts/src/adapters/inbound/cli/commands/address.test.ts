import { describe, it, expect } from "vitest";
import { registerAddressCommands } from "./address.js";
import { CommandRegistry } from "../registry/index.js";
import { HelpService } from "../help/index.js";
import type { StreamManager } from "../contracts/index.js";

function helpFor(path: string[]): string {
  const registry = new CommandRegistry();
  registerAddressCommands(registry, { generate: async () => ({}) } as never);
  let rendered = "";
  const streams = {
    result(text: string) {
      rendered = text;
    },
    diagnostic() {},
    errorLine() {},
    event() {},
    readStdinOnce: () => "",
    warnings: () => [],
  } as unknown as StreamManager;
  new HelpService(registry, streams, "0.0.0").handleMeta([...path, "--help"]);
  return rendered;
}

function schemaFor(path: string[]): any {
  const registry = new CommandRegistry();
  registerAddressCommands(registry, { generate: async () => ({}) } as never);
  let rendered = "";
  const streams = {
    result(text: string) {
      rendered = text;
    },
    diagnostic() {},
    errorLine() {},
    event() {},
    readStdinOnce: () => "",
    warnings: () => [],
  } as unknown as StreamManager;
  new HelpService(registry, streams, "0.0.0").handleMeta([...path, "--json-schema"]);
  return JSON.parse(rendered);
}

describe("address generate --out documents its default location", () => {
  it("names the default path in the flag description", () => {
    const out =
      helpFor(["address", "generate"])
        .split("\n")
        .find((line) => line.trimStart().startsWith("--out")) ?? "";
    expect(out).toContain("generated/keypair-<address>");
  });

  it("keeps the machine schema honest: --out has no schema-level default", () => {
    const properties = schemaFor(["address", "generate"]).properties;
    expect(properties.out).toBeDefined();
    expect(properties.out).not.toHaveProperty("default");
  });

  it("does not fake a default tag on the rendered flag line", () => {
    const out =
      helpFor(["address", "generate"])
        .split("\n")
        .find((line) => line.trimStart().startsWith("--out")) ?? "";
    expect(out).toContain("[optional]");
    expect(out).not.toMatch(/\[optional, default:/);
  });
});
