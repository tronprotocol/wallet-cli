import { describe, it, expect } from "vitest";
import { z } from "zod";
import { isChainCommand, type ChainCommandDefinition, type CommandDefinition } from "./command.js";

describe("isChainCommand", () => {
  it("is true for a ChainCommandDefinition and false for a legacy CommandDefinition", () => {
    const chain: ChainCommandDefinition = {
      spec: { path: ["block"], network: "optional", wallet: "none", auth: "none", examples: [], baseFields: z.object({}) },
      families: { tron: { run: async () => ({}) } },
    };
    const legacy = { path: ["block"], network: "none", wallet: "none", auth: "none", fields: z.object({}), input: z.object({}), examples: [], run: async () => ({}) } as unknown as CommandDefinition;
    expect(isChainCommand(chain)).toBe(true);
    expect(isChainCommand(legacy)).toBe(false);
  });
});
