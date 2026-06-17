import { describe, it, expect } from "vitest";
import { walletImportInput } from "./neutral.js";

const ok = (v: unknown) => walletImportInput.safeParse(v).success;
const issues = (v: unknown) => {
  const r = walletImportInput.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("wallet import contract", () => {
  it("accepts a plain seed import", () => {
    expect(ok({ type: "seed", label: "main" })).toBe(true);
  });

  it("requires --app for a ledger import", () => {
    expect(issues({ type: "ledger", index: 0 })).toContain("app");
  });

  it("accepts a ledger import with exactly one locator", () => {
    expect(ok({ type: "ledger", app: "ethereum", index: 0 })).toBe(true);
    expect(ok({ type: "ledger", app: "tron", path: "m/44'/195'/0'/0/0" })).toBe(true);
    expect(ok({ type: "ledger", app: "ethereum", address: "0xabc", scanLimit: 30 })).toBe(true);
  });

  it("rejects more than one locator (mutually exclusive)", () => {
    expect(ok({ type: "ledger", app: "ethereum", index: 0, path: "m/44'/60'/0'/0/0" })).toBe(false);
    expect(ok({ type: "ledger", app: "ethereum", index: 0, address: "0xabc" })).toBe(false);
  });

  it("rejects ledger-only flags on a seed/privateKey import", () => {
    expect(ok({ type: "seed", app: "ethereum" })).toBe(false);
    expect(ok({ type: "privateKey", index: 0 })).toBe(false);
  });

  it("coerces --index and --scan-limit from strings", () => {
    const r = walletImportInput.safeParse({ type: "ledger", app: "ethereum", index: "2" });
    expect(r.success && (r.data as { index?: number }).index).toBe(2);
  });
});
