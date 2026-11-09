import { describe, expect, it } from "vitest";
import { isTronExpirationMs, MAX_TRON_EXPIRATION_MS } from "./index.js";

describe("isTronExpirationMs", () => {
  it("accepts integers from 1 to 24 hours", () => {
    expect(isTronExpirationMs(1)).toBe(true);
    expect(isTronExpirationMs(MAX_TRON_EXPIRATION_MS)).toBe(true);
  });

  it.each([0, -1, 1.5, MAX_TRON_EXPIRATION_MS + 1, "60000", undefined])("rejects %s", (value) => {
    expect(isTronExpirationMs(value)).toBe(false);
  });
});
