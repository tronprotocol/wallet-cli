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
    expect(text).toMatch(/without blocking/i);
  });

  it("covers service calls too, not just node RPC and the device", () => {
    const text = spec("timeout").description;
    expect(text).toMatch(/service/i);
    expect(text).toMatch(/device/i);
    expect(text).toMatch(/node/i);
  });
});

describe("timeout flags apply the config value rules", () => {
  it.each([
    ["timeoutMs", "0.5", false],
    ["timeoutMs", "1", true],
    ["waitTimeoutMs", "1.5", false],
    ["waitTimeoutMs", "0", true],
    ["waitTimeoutMs", "-1", false],
  ])("%s %s accepted: %s", (field, raw, ok) => {
    expect(coerceGlobalValue(field, raw).ok).toBe(ok);
  });
});
