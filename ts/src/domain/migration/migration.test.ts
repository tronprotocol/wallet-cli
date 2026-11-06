import { describe, it, expect } from "vitest";
import { planMigrations, storedVersionOf } from "./index.js";

describe("planMigrations", () => {
  it("plans no work when every file is already at the current version", () => {
    const plan = planMigrations([
      { path: "wallets.json", currentVersion: 2, storedVersion: 2, needsPassword: false },
      { path: "contacts.json", currentVersion: 2, storedVersion: 2, needsPassword: false },
    ]);

    expect(plan.stale).toEqual([]);
    expect(plan.needsPassword).toBe(false);
  });

  it("plans work for a file whose stored version lags the binary", () => {
    const plan = planMigrations([
      { path: "wallets.json", currentVersion: 2, storedVersion: 1, needsPassword: false },
      { path: "contacts.json", currentVersion: 2, storedVersion: 2, needsPassword: false },
    ]);

    expect(plan.stale.map((c) => c.path)).toEqual(["wallets.json"]);
  });

  it("leaves a file newer than the binary alone", () => {
    const plan = planMigrations([
      { path: "wallets.json", currentVersion: 2, storedVersion: 3, needsPassword: true },
    ]);

    expect(plan.stale).toEqual([]);
    expect(plan.needsPassword).toBe(false);
  });

  it("requires the password when a stale file needs one", () => {
    const plan = planMigrations([
      { path: "contacts.json", currentVersion: 2, storedVersion: 1, needsPassword: false },
      { path: "wallets.json", currentVersion: 2, storedVersion: 1, needsPassword: true },
    ]);

    expect(plan.needsPassword).toBe(true);
  });

  it("requires no password when no stale file needs one", () => {
    const plan = planMigrations([
      { path: "wallets.json", currentVersion: 2, storedVersion: 1, needsPassword: false },
    ]);

    expect(plan.stale).toHaveLength(1);
    expect(plan.needsPassword).toBe(false);
  });

  it("ignores a password-needing file that is not stale", () => {
    const plan = planMigrations([
      { path: "wallets.json", currentVersion: 2, storedVersion: 2, needsPassword: true },
      { path: "contacts.json", currentVersion: 2, storedVersion: 1, needsPassword: false },
    ]);

    expect(plan.needsPassword).toBe(false);
  });
});

describe("storedVersionOf", () => {
  it("treats an absent file as already current", () => {
    expect(storedVersionOf(null, 2, "wallets.json")).toBe(2);
  });

  it("reports the version a stored document carries", () => {
    expect(storedVersionOf({ version: 1, wallets: [] }, 2, "wallets.json")).toBe(1);
  });

  it.each([
    ["missing", { wallets: [] }],
    ["non-numeric", { version: "1" }],
    ["fractional", { version: 1.5 }],
    ["zero", { version: 0 }],
    ["negative", { version: -1 }],
  ])("rejects a document whose version is %s", (_label, doc) => {
    expect(() => storedVersionOf(doc, 2, "wallets.json")).toThrow(/wallets\.json/);
  });
});
