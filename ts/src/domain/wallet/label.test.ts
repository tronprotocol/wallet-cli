import { describe, it, expect } from "vitest";
import { derivedAccountLabel, walletLabel } from "./label.js";

describe("walletLabel", () => {
  it("trims a label", () => {
    expect(walletLabel("  main ")).toBe("main");
  });

  it.each([
    ["empty", " "],
    ["too long", "x".repeat(65)],
    ["reserved", "wlt_x"],
  ])("rejects a %s label", (_label, value) => {
    expect(() => walletLabel(value)).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });
});

describe("derivedAccountLabel", () => {
  it("suffixes the base label with the index", () => {
    expect(derivedAccountLabel("main", 3)).toBe("main-3");
    expect(derivedAccountLabel(undefined, 1)).toBe("hd-1");
  });

  it("shortens a long base so the result is still a valid label", () => {
    expect(walletLabel(derivedAccountLabel("x".repeat(64), 12))).toHaveLength(64);
  });
});
