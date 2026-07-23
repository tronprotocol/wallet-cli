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
    expect(transactionMode({})).toEqual({
      mode: "broadcast",
      dryRun: false,
      buildOnly: false,
      broadcast: true,
      permissionId: 0,
    });
  });

  it("--dry-run → build + estimate only", () => {
    expect(transactionMode({ dryRun: true })).toMatchObject({ mode: "dry-run", dryRun: true, broadcast: false });
  });

  it("--sign-only → sign, do not broadcast", () => {
    expect(transactionMode({ signOnly: true })).toMatchObject({ mode: "sign-only", dryRun: false, broadcast: false });
  });

  it("--dry-run + --sign-only → invalid_option", () => {
    expectCode(() => transactionMode({ dryRun: true, signOnly: true }), "invalid_option");
  });

  it("supports unsigned build artifacts and bounded expiration", () => {
    expect(transactionMode({ buildOnly: true, permissionId: 2, expiration: 86_400_000 })).toMatchObject({
      mode: "build-only",
      permissionId: 2,
      expiration: 86_400_000,
    });
    expectCode(() => transactionMode({ expiration: 1_000 }), "invalid_option");
    expectCode(() => transactionMode({ signOnly: true, expiration: 86_400_001 }), "invalid_option");
    expectCode(() => transactionMode({ permissionId: 10 }), "invalid_option");
  });
});
