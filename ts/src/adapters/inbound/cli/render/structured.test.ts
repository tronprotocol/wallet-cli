import { describe, expect, it } from "vitest";
import { structuredText } from "./structured.js";

describe("human-readable nested results", () => {
  it("expands nested objects and empty lists without losing decimal precision", () => {
    const value = {
      records: [{ amount: "0.000000000000000001", enabled: false }],
      empty: [],
      missing: null,
    };
    const output = structuredText(value);
    expect(output).toContain("amount: 0.000000000000000001");
    expect(output).toContain("enabled: No");
    expect(output).toContain("empty:\n  None");
    expect(output).toContain("missing: Not available");
    expect(output).not.toMatch(/[{}[\]]/);
    expect(value.records[0]?.enabled).toBe(false);
  });

  it("sanitizes untrusted nested labels and strings", () => {
    const output = structuredText({ "a\nlabel": { value: "\u001b[31munsafe\u202e" } });
    expect(output).toContain("a label:");
    expect(output).not.toContain("\u001b");
    expect(output).toContain("<U+202E>");
  });
});
