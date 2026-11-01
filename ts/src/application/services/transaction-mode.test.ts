import { describe, it, expect } from "vitest";
import { transactionMode, waitsForConfirmation } from "./transaction-mode.js";

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
    expect(transactionMode({})).toEqual({ mode: "broadcast", permissionId: 0 });
  });

  it("--dry-run → build + estimate only", () => {
    expect(transactionMode({ dryRun: true })).toEqual({ mode: "dry-run", permissionId: 0 });
  });

  it("--sign-only → sign, do not broadcast", () => {
    expect(transactionMode({ signOnly: true })).toEqual({ mode: "sign-only", permissionId: 0 });
  });

  it("--build-only → unsigned transaction without broadcast", () => {
    expect(transactionMode({ buildOnly: true })).toEqual({ mode: "build-only", permissionId: 0 });
  });

  it("--dry-run + --sign-only → invalid_option", () => {
    expectCode(() => transactionMode({ dryRun: true, signOnly: true }), "invalid_option");
  });

  it("supports unsigned build artifacts and bounded expiration", () => {
    expect(
      transactionMode({ buildOnly: true, permissionId: 2, expiration: 86_400_000 }),
    ).toMatchObject({
      mode: "build-only",
      permissionId: 2,
      expiration: 86_400_000,
    });
    expectCode(() => transactionMode({ expiration: 1_000 }), "invalid_option");
    expectCode(() => transactionMode({ signOnly: true, expiration: 86_400_001 }), "invalid_option");
    expectCode(() => transactionMode({ permissionId: 10 }), "invalid_option");
  });

  it("names inputs by field, not by flag", () => {
    expect(() => transactionMode({ dryRun: true, buildOnly: true })).toThrow(
      "choose at most one of dryRun, signOnly, buildOnly",
    );
    expect(() => transactionMode({ permissionId: 10 })).toThrow(
      "permissionId must be an integer from 0 to 9",
    );
    expect(() => transactionMode({ expiration: 1_000 })).toThrow(
      "expiration is only valid with signOnly or buildOnly",
    );
  });
});

describe("waitsForConfirmation", () => {
  it.each([
    [undefined, true],
    [true, true],
    [false, false],
  ] as const)(
    "waits by default where a transaction is submitted (intent %s → %s)",
    (intent, wait) => {
      expect(waitsForConfirmation(intent, true)).toBe(wait);
    },
  );

  it("runs without waiting where nothing is submitted and no intent is given", () => {
    expect(waitsForConfirmation(undefined, false)).toBe(false);
  });

  it.each([
    [true, "wait"],
    [false, "noWait"],
  ] as const)(
    "refuses explicit intent %s where nothing is submitted, naming %s",
    (intent, input) => {
      let error: unknown;
      try {
        waitsForConfirmation(intent, false);
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ code: "invalid_option" });
      expect((error as { userMessage: { parts: unknown[] } }).userMessage.parts).toContainEqual({
        input,
      });
    },
  );
});
