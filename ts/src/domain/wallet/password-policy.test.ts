import { describe, it, expect } from "vitest";
import {
  assertPasswordPolicy,
  passwordPolicyErrors,
  PASSWORD_SPECIALS,
} from "./password-policy.js";

describe("passwordPolicyErrors", () => {
  it("accepts a strong password", () => {
    expect(passwordPolicyErrors("Abcdef1!")).toEqual([]);
  });
  it("rejects too short", () => {
    expect(passwordPolicyErrors("Ab1!")).toContainEqual(expect.stringContaining("8"));
  });
  it("flags each missing class", () => {
    const errs = passwordPolicyErrors("abcdefgh");
    expect(errs.length).toBe(3);
  });
  it("uses the documented special set", () => {
    expect(PASSWORD_SPECIALS).toContain("!");
    expect(passwordPolicyErrors("Abcdefg1#")).toEqual([]);
  });
});

describe("assertPasswordPolicy", () => {
  it("rejects an empty password with weak_password", () => {
    expect(() => assertPasswordPolicy("")).toThrowError(
      expect.objectContaining({ code: "weak_password" }),
    );
  });
});
