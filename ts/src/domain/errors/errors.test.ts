import { describe, it, expect } from "vitest";
import { classifyError, errorMessage, UsageError } from "./index.js";

describe("errorMessage trusted layout and external values", () => {
  it("escapes input line separators while preserving authored multiline guidance", () => {
    const input = "first\r\nsecond\u0085third\u2028fourth\u2029last";
    const error = new UsageError("invalid_value", errorMessage`Invalid: ${input}\nTry again.`);
    expect(error.textMessage).toBe(
      "Invalid: first\\r\\nsecond\\u0085third\\u2028fourth\\u2029last\nTry again.",
    );
    expect(error.message).toBe(`Invalid: ${input}\nTry again.`);
  });

  it("keeps ordinary paths, quotes, amounts, and plain authored messages unchanged", () => {
    const path = "C:\\wallet's files\\tx.hex";
    const error = new UsageError(
      "invalid_value",
      errorMessage`File '${path}' exceeds ${1024} bytes`,
    );
    expect(error.textMessage).toBe(error.message);
    expect(new UsageError("invalid_value", "First line\nSecond line").textMessage).toBe(
      "First line\nSecond line",
    );
  });
});

describe("nested messages", () => {
  it("keeps a nested message's raw and text renderings", () => {
    const inner = new UsageError("invalid_value", errorMessage`bad --fee: ${"a\nb"}`);
    const outer = errorMessage`${inner.userMessage}; more`;
    expect(outer.message).toBe("bad --fee: a\nb; more");
    expect(outer.textMessage).toBe("bad --fee: a\\nb; more");
    const plain = errorMessage`${{ message: "x\ny", textMessage: "x\\ny" }}!`;
    expect(plain.textMessage).toBe("x\\ny!");
  });
});

describe("classifyError", () => {
  it("passes a CliError through unchanged (already canonical)", () => {
    const e = new UsageError("missing_option", "need to");
    expect(classifyError(e)).toBe(e);
  });

  it("maps an AbortError (timeout abort) to a timeout error", () => {
    const e = new Error("The operation was aborted");
    e.name = "AbortError";
    const c = classifyError(e);
    expect(c.code).toBe("timeout");
    expect(c.kind).toBe("execution");
  });

  it("redacts an unknown error so a leaked secret never reaches the envelope", () => {
    const c = classifyError(new Error("boom: privkey 0xdeadbeefcafe"));
    expect(c.code).toBe("internal_error");
    expect(c.message).not.toContain("0xdeadbeef");
  });
});
