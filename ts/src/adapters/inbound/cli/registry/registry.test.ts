import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry } from "./index.js";
import { commandId } from "../command-id.js";

function command(family: ChainFamily, path: string[]): CommandDefinition {
  const fields = z.object({});
  return {
    family,
    path,
    network: "optional",
    wallet: "optional",
    auth: "none",
    fields,
    input: fields,
    examples: [],
    run: async () => ({}),
  };
}

describe("CommandRegistry logical resolution", () => {
  it("rejects a family command that cannot resolve a network", () => {
    const reg = new CommandRegistry();
    const fields = z.object({});
    expect(() => reg.add({
      family: "tron",
      path: ["invalid"],
      network: "none",
      wallet: "none",
      auth: "none",
      fields,
      input: fields,
      examples: [],
      run: async () => ({}),
    })).toThrow("family command must resolve a network: tron.invalid");
  });

  it("returns every implementation for a logical path", () => {
    const reg = new CommandRegistry();
    // synthetic second family via cast: only tron ships, but the registry keys on the family
    // string, so this still exercises multi-implementation logical resolution.
    reg.add(command("tron", ["account", "balance"]));
    reg.add(command("evm" as any, ["account", "balance"]));

    expect(reg.resolveCandidates(["account", "balance"]).map((c) => commandId(c))).toEqual([
      "tron.account.balance",
      "evm.account.balance",
    ]);
  });

  it("selects one implementation by family", () => {
    const reg = new CommandRegistry();
    reg.add(command("tron", ["account", "balance"]));
    reg.add(command("evm" as any, ["account", "balance"]));

    expect(commandId(reg.resolveForFamily(["account", "balance"], "evm" as any)!)).toBe("evm.account.balance");
    expect(reg.resolveForFamily(["account", "missing"], "evm" as any)).toBeNull();
  });
});
