import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry } from "./index.js";

function command(path: string[]): CommandDefinition {
  const fields = z.object({});
  return {
    path,
    network: "none",
    wallet: "none",
    auth: "none",
    fields,
    input: fields,
    examples: [],
    run: async () => ({}),
  };
}

describe("CommandRegistry neutral resolution", () => {
  it("resolves a neutral command by its full path", () => {
    const reg = new CommandRegistry();
    reg.add(command(["import", "mnemonic"]));
    expect(reg.resolveNeutral(["import", "mnemonic"])?.path).toEqual(["import", "mnemonic"]);
    expect(reg.resolveNeutral(["import", "missing"])).toBeNull();
  });

  it("rejects a duplicate path", () => {
    const reg = new CommandRegistry();
    reg.add(command(["create"]));
    expect(() => reg.add(command(["create"]))).toThrow("duplicate command create");
  });
});
