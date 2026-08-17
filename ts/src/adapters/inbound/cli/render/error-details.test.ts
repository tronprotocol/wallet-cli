import { describe, expect, it } from "vitest";
import { renderErrorDetails } from "./error-details.js";

describe("renderErrorDetails", () => {
  const matches = [
    {
      assetId: "1000123",
      issuerAddress: "TQkXm4vN",
      totalSupply: "1000000000000000",
      precision: 6,
    },
    { assetId: "1000488", issuerAddress: "TZx9kP2m", totalSupply: "5000000000", precision: 2 },
  ];

  it("tables the candidates so a human can pick one", () => {
    const out = renderErrorDetails({ name: "MyToken", assetIds: ["1000123", "1000488"], matches });
    expect(out).toContain("ID");
    expect(out).toContain("Total supply");
    expect(out).toContain("1000123");
    expect(out).toContain("1000488");
  });

  // The row reports raw minimal units; text shows the same whole-token figure `asset info` does,
  // so the two views of one token never disagree.
  it("scales each row's supply by its own precision", () => {
    const out = renderErrorDetails({ matches })!;
    expect(out).toContain("1,000,000,000"); // 1e15 at precision 6
    expect(out).toContain("50,000,000"); // 5e9 at precision 2
    expect(out).not.toContain("1000000000000000");
  });

  it("adds nothing to errors that are a dead end rather than a choice", () => {
    expect(renderErrorDetails(undefined)).toBeNull();
    expect(renderErrorDetails({})).toBeNull();
    expect(renderErrorDetails({ assetIds: ["1000123"] })).toBeNull();
    expect(renderErrorDetails({ matches: [] })).toBeNull();
    expect(renderErrorDetails({ matches: [{}] })).toBeNull();
  });

  // The contract is the `matches` key, not the asset shape — a future error opts in for free.
  it("derives its columns from whatever keys the rows carry", () => {
    const out = renderErrorDetails({ matches: [{ label: "cold", path: "m/44'/195'/1'/0/0" }] })!;
    expect(out).toContain("label");
    expect(out).toContain("path");
    expect(out).toContain("cold");
  });
});
