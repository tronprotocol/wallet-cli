import { describe, expect, it } from "vitest";
import {
  contactNameKey,
  contactNote,
  createContact,
} from "./index.js";

const ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

describe("contact validation", () => {
  it("normalizes compatibility-equivalent names into one lookup key", () => {
    expect(contactNameKey(" ＡＬＩＣＥ ")).toBe("alice");
  });

  it("rejects address-shaped aliases and control characters", () => {
    expect(() => contactNameKey(ADDRESS)).toThrow(/must not resemble/);
    expect(() => contactNameKey("alice\u202e")).toThrow(/safe characters/);
  });

  it("enforces character limits while preserving valid Unicode", () => {
    expect(contactNote("账".repeat(128))).toBe("账".repeat(128));
    expect(() => contactNote("账".repeat(129))).toThrow(/128/);
    expect(createContact("tron", "财务", ADDRESS)).toMatchObject({
      name: "财务",
      address: ADDRESS,
      family: "tron",
    });
  });

  it("rejects an invalid Base58Check address", () => {
    expect(() =>
      createContact(
        "tron",
        "alice",
        "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HX",
      )
    ).toThrow(/Base58Check/);
  });
});
