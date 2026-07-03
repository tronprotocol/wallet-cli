import { describe, it, expect } from "vitest";
import { transactionMode } from "./transaction-mode.js";

/** assert fn throws a CliError carrying the given .code. */
function expectCode(fn: () => unknown, code: string) {
  expect(fn).toThrowError();
  try {
    fn();
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe("transactionMode", () => {
  it("no flag → broadcast (default)", () => {
    expect(transactionMode({})).toEqual({ dryRun: false, broadcast: true });
  });

  it("--dry-run → build + estimate only", () => {
    expect(transactionMode({ dryRun: true })).toEqual({ dryRun: true, broadcast: false });
  });

  it("--sign-only → sign, do not broadcast", () => {
    expect(transactionMode({ signOnly: true })).toEqual({ dryRun: false, broadcast: false });
  });

  it("--dry-run + --sign-only → invalid_option", () => {
    expectCode(() => transactionMode({ dryRun: true, signOnly: true }), "invalid_option");
  });
});
