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

  // ADR-0008: the check is `<`, not `!==`. A file written by a NEWER binary is left alone
  // rather than being "migrated" downward into a shape this binary invented.
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

  // A keystore holding only ledger / watch accounts migrates with no secret at all: they are
  // single-family by construction and carry no address map to fill in (ADR-0008).
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
  // The bug this exists to prevent: keystore/index.ts and contactbook/index.ts synthesise a
  // LITERAL version 1 for an absent file. Once CURRENT is 2, a machine with no wallet at all
  // would look stale and be told to migrate something that was never created.
  it("treats an absent file as already current", () => {
    expect(storedVersionOf(null, 2, "wallets.json")).toBe(2);
  });

  it("reports the version a stored document carries", () => {
    expect(storedVersionOf({ version: 1, wallets: [] }, 2, "wallets.json")).toBe(1);
  });

  // A garbage version must NOT read as 0 and trigger a migration: that would run a v1->v2
  // transform against a shape we know nothing about, on a file holding wallet state.
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
