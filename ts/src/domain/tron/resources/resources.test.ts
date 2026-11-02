import { describe, it, expect } from "vitest";
import { MAX_UNFREEZING_ENTRIES, RESOURCES, RESOURCE_META, toRpcCode } from "./index.js";

describe("resource registry", () => {
  it("maps the lowercase name to TRON's canonical case", () => {
    expect(toRpcCode("energy")).toBe("ENERGY");
    expect(toRpcCode("bandwidth")).toBe("BANDWIDTH");
  });

  it("keeps RESOURCE_META keyed by the canonical list", () => {
    expect(Object.keys(RESOURCE_META).sort()).toEqual([...RESOURCES].sort());
  });
});

describe("unstaking limit", () => {
  it("allows 32 pending unstaking entries per account", () => {
    expect(MAX_UNFREEZING_ENTRIES).toBe(32);
  });
});
