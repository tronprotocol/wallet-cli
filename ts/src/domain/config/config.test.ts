import { describe, expect, it } from "vitest";
import { withNetworkField } from "./index.js";

const NILE = "tron:3448148188";
const sameAsNile = (key: string) => key === NILE || key === "nile";

describe("withNetworkField", () => {
  it("folds alias entries into the canonical id before setting the field", () => {
    const entries = {
      nile: { httpEndpoint: "https://alias.example", apiKeyHeader: "X-Old" },
      [NILE]: { apiKeyHeader: "X-Canonical" },
      sepolia: { httpEndpoint: "https://sepolia.example" },
    };
    expect(withNetworkField(entries, NILE, sameAsNile, "apiKey", "k")).toEqual({
      sepolia: { httpEndpoint: "https://sepolia.example" },
      [NILE]: { httpEndpoint: "https://alias.example", apiKeyHeader: "X-Canonical", apiKey: "k" },
    });
  });

  it("adds the network when no entry names it", () => {
    expect(withNetworkField({}, NILE, sameAsNile, "apiKeyHeader", "X-Key")).toEqual({
      [NILE]: { apiKeyHeader: "X-Key" },
    });
  });

  it("leaves the input entries unchanged", () => {
    const entries = { nile: { apiKey: "old" } };
    withNetworkField(entries, NILE, sameAsNile, "apiKey", "new");
    expect(entries).toEqual({ nile: { apiKey: "old" } });
  });
});
