import { describe, it, expect } from "vitest";
import { txMode } from "./shared.js";

/** assert fn throws a CliError carrying the given .code. */
function expectCode(fn: () => unknown, code: string) {
  expect(fn).toThrowError();
  try {
    fn();
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe("txMode", () => {
  it("no flag → broadcast (default)", () => {
    expect(txMode({})).toEqual({ dryRun: false, broadcast: true });
  });

  it("--dry-run → build + estimate only", () => {
    expect(txMode({ dryRun: true })).toEqual({ dryRun: true, broadcast: false });
  });

  it("--sign-only → sign, do not broadcast", () => {
    expect(txMode({ signOnly: true })).toEqual({ dryRun: false, broadcast: false });
  });

  it("--dry-run + --sign-only → invalid_option", () => {
    expectCode(() => txMode({ dryRun: true, signOnly: true }), "invalid_option");
  });
});
