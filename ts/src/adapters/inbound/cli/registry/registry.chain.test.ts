import { describe, it, expect } from "vitest";
import { z } from "zod";
import { CommandRegistry } from "./index.js";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";

const spec: ChainSpec = { path: ["block"], network: "optional", wallet: "none", auth: "none", examples: [], baseFields: z.object({}) };
const tron: FamilyBinding = { run: async () => ({ block: {} }) };

describe("CommandRegistry.addChain", () => {
  it("creates a ChainCommandDefinition resolvable by path", () => {
    const reg = new CommandRegistry();
    reg.addChain(spec, "tron", tron);
    const def = reg.resolveChain(["block"]);
    expect(def).not.toBeNull();
    expect(def!.spec).toBe(spec);
    expect(def!.families.tron).toBe(tron);
  });

  it("rejects a duplicate (path, family) binding", () => {
    const reg = new CommandRegistry();
    reg.addChain(spec, "tron", tron);
    expect(() => reg.addChain(spec, "tron", tron)).toThrow(/duplicate/);
  });

  it("resolveChain returns null for an unknown path", () => {
    expect(new CommandRegistry().resolveChain(["nope"])).toBeNull();
  });
});
