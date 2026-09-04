import { describe, it, expect } from "vitest";
import { classifyError, normalizeError, ChainError, UsageError } from "./index.js";

describe("classifyError (classify half of the classify↔render split)", () => {
  it("passes a CliError through unchanged (already canonical)", () => {
    const e = new UsageError("missing_option", "need --to");
    expect(classifyError(e)).toBe(e);
  });

  it("maps an AbortError (timeout abort) to a timeout execution error (exit 1)", () => {
    const e = new Error("The operation was aborted");
    e.name = "AbortError";
    const c = classifyError(e);
    expect(c.code).toBe("timeout");
    expect(c.exitCode()).toBe(1);
  });

  it("recognizes yargs usage text as usage_error (exit 2)", () => {
    const c = classifyError(new Error("Missing required argument: network"));
    expect(c.code).toBe("usage_error");
    expect(c.exitCode()).toBe(2);
  });

  it("redacts an unknown error so a leaked secret never reaches the envelope", () => {
    const c = classifyError(new Error("boom: privkey 0xdeadbeefcafe"));
    expect(c.code).toBe("internal_error");
    expect(c.message).not.toContain("0xdeadbeef");
  });

  it("normalizeError delegates to classifyError (same canonical result)", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(normalizeError(e).code).toBe(classifyError(e).code);
  });

  it("takes the exit code from the code's entry, not from the class it was thrown as", () => {
    // not_found is declared exit 1. Thrown as a UsageError it must STILL be exit 1 — the table is
    // the contract, the class is only the author's stated intent (and the guard test catches the
    // disagreement separately).
    expect(new UsageError("not_found", "x").exitCode()).toBe(1);
    expect(new ChainError("family_mismatch", "x").exitCode()).toBe(2);
  });

  it("falls back to the class for a code the table marks as either", () => {
    expect(new UsageError("invalid_value", "x").exitCode()).toBe(2);
    expect(new ChainError("invalid_value", "x").exitCode()).toBe(1);
  });
});
