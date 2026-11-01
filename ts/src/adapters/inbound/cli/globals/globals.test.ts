import { describe, it, expect } from "vitest";
import { coerceGlobalValue, GLOBAL_FLAG_SPECS } from "./index.js";
import { gasFreeTransferSpec } from "../commands/gasfree.js";

const spec = (name: string) => GLOBAL_FLAG_SPECS.find((f) => f.name === name)!;

describe("global --wait / --timeout wording holds for every command that shows them", () => {
  it("offers --wait on gasfree transfer, which never broadcasts", () => {
    expect(gasFreeTransferSpec.broadcasts).toBe(true);
  });

  it("does not describe --wait as an on-chain broadcast returning a txid", () => {
    const text = spec("wait").description;
    expect(text).not.toMatch(/broadcast/i);
    expect(text).not.toMatch(/txid/i);
    expect(text).toMatch(/confirmed/i);
    expect(text).toMatch(/default/i);
    expect(spec("wait").negation).toMatch(/without polling/i);
  });

  it("describes one deadline for the whole command, with 0 as no limit", () => {
    const text = spec("timeout").description;
    expect(text).toMatch(/whole command/i);
    expect(text).toMatch(/0 = no limit/);
  });

  it("publishes the bounds its rule enforces", () => {
    expect(spec("timeout").bounds).toEqual({ minimum: 0, maximum: 2_147_483_647 });
    expect(GLOBAL_FLAG_SPECS.some((f) => f.name === "wait-timeout")).toBe(false);
  });
});

describe("timeout flags apply the config value rules", () => {
  it.each([
    ["timeoutMs", "0.5", false],
    ["timeoutMs", "0", true],
    ["timeoutMs", "1", true],
    ["timeoutMs", "2147483647", true],
    ["timeoutMs", "2147483648", false],
    ["timeoutMs", "-1", false],
    ["timeoutMs", "", false],
  ])("%s %s accepted: %s", (field, raw, ok) => {
    expect(coerceGlobalValue(field, raw).ok).toBe(ok);
  });
});
