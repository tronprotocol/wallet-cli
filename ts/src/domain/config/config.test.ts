import { describe, expect, it } from "vitest";
import { MAX_TIMEOUT_MS, TIMEOUT_MS_RULE, timeoutMsFromText, withNetworkField } from "./index.js";

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

describe("TIMEOUT_MS_RULE", () => {
  it.each([0, 1, MAX_TIMEOUT_MS])("accepts %s", (value) => {
    expect(TIMEOUT_MS_RULE.accepts(value)).toBe(true);
  });

  it.each([2 ** 31, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, "5000", null])(
    "rejects %s",
    (value) => {
      expect(TIMEOUT_MS_RULE.accepts(value)).toBe(false);
    },
  );
});

describe("timeoutMsFromText", () => {
  it("reads decimal digits only", () => {
    expect(timeoutMsFromText("0")).toBe(0);
    expect(timeoutMsFromText("90000")).toBe(90000);
    for (const text of ["", " 5", "1e3", "0x10", "-1", "1.0"]) {
      expect(timeoutMsFromText(text)).toBeNaN();
    }
  });
});
