import { describe, expect, it } from "vitest";
import { inputRef } from "../errors/index.js";
import { accountText } from "./index.js";

describe("accountText", () => {
  it.each([
    ["name", "a"],
    ["name", "é".repeat(16)],
    ["id", "abcdefgh"],
    ["id", "a".repeat(32)],
  ] as const)("accepts %s %j", (kind, value) => {
    expect(accountText(kind, value)).toBe(value);
  });

  it.each([
    ["name", "", "name must be 1-32 safe UTF-8 bytes"],
    ["name", "a".repeat(33), "name must be 1-32 safe UTF-8 bytes"],
    ["name", "a​b", "name must be 1-32 safe UTF-8 bytes"],
    ["id", "abcdefg", "id must be 8-32 safe UTF-8 bytes"],
    ["id", "abcdefgh\n", "id must be 8-32 safe UTF-8 bytes"],
  ] as const)("rejects %s %j", (kind, value, message) => {
    expect(() => accountText(kind, value)).toThrow(
      expect.objectContaining({
        code: "invalid_value",
        message,
        parts: expect.arrayContaining([inputRef(kind)]),
      }),
    );
  });
});
