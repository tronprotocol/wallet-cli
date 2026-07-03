import { describe, it, expect } from "vitest";
import { RESOURCES, RESOURCE_META, toRpcCode, resourceOfRpcCode } from "./index.js";

describe("resource registry", () => {
  it("round-trips every resource through its RPC code", () => {
    for (const r of RESOURCES) {
      expect(resourceOfRpcCode(toRpcCode(r))).toBe(r);
    }
  });

  it("maps the lowercase name to TRON's canonical case", () => {
    expect(toRpcCode("energy")).toBe("ENERGY");
    expect(toRpcCode("bandwidth")).toBe("BANDWIDTH");
  });

  it("returns undefined for an unrecognized RPC code (frozenV2 bandwidth has no type)", () => {
    expect(resourceOfRpcCode("")).toBeUndefined();
    expect(resourceOfRpcCode("STORAGE")).toBeUndefined();
  });

  it("keeps RESOURCE_META keyed by the canonical list", () => {
    expect(Object.keys(RESOURCE_META).sort()).toEqual([...RESOURCES].sort());
  });
});
