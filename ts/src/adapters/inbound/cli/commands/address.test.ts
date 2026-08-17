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

// Omitting --out writes a plaintext private key under the wallet root. The command reports the
// path afterwards, but help is what a reader consults *before* deciding to run this on a shared
// machine or a CI runner — so the location has to be visible up front, not only in the receipt.
describe("address generate --out documents its default location", () => {
  it("names the default path in the flag description", () => {
    const out =
      helpFor(["address", "generate"])
        .split("\n")
        .find((line) => line.trimStart().startsWith("--out")) ?? "";
    // shape asserted against the writer in keypair-writer.test.ts ("derives the default location…")
    expect(out).toContain("generated/keypair-<address>");
  });

  it("keeps the machine schema honest: --out has no schema-level default", () => {
    const properties = schemaFor(["address", "generate"]).properties;
    expect(properties.out).toBeDefined();
    expect(properties.out).not.toHaveProperty("default");
  });

  // The rendered "[optional, default: X]" tag is derived from zod, so faking one here would put a
  // default in help that --json-schema does not have.
  it("does not fake a default tag on the rendered flag line", () => {
    const out =
      helpFor(["address", "generate"])
        .split("\n")
        .find((line) => line.trimStart().startsWith("--out")) ?? "";
    expect(out).toContain("[optional]");
    expect(out).not.toMatch(/\[optional, default:/);
  });
});
