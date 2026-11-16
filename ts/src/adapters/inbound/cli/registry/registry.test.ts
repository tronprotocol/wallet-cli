import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry, unknownCommand } from "./index.js";

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

describe("unknownCommand", () => {
  it("names the first word in the plugin install hint without claiming a plugin exists", () => {
    const registry = new CommandRegistry();
    registry.add(command(["tx", "send"]));
    expect(unknownCommand(registry, ["never-seen-protocol", "action"]).message).toBe(
      "unknown command: never-seen-protocol action; run 'wallet-cli plugin list' to see the installed plugins; if a plugin provides it, add it with 'wallet-cli plugin install never-seen-protocol'",
    );
  });

  it("gives no plugin hint under a known first word", () => {
    const registry = new CommandRegistry();
    registry.add(command(["tx", "send"]));
    expect(unknownCommand(registry, ["tx", "nope"]).message).toBe("unknown command: tx nope");
  });
});
