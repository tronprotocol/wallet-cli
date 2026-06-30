import { describe, it, expect } from "vitest";
import { walletImportLedgerInput } from "./wallet.js";

const ok = (v: unknown) => walletImportLedgerInput.safeParse(v).success;

describe("wallet import-ledger contract", () => {
  it("requires --app", () => {
    expect(ok({ index: 0 })).toBe(false);
  });

  it("accepts exactly one locator", () => {
    expect(ok({ app: "tron", index: 0 })).toBe(true);
    expect(ok({ app: "tron", path: "m/44'/195'/0'/0/0" })).toBe(true);
    expect(ok({ app: "tron", address: "Tabc", scanLimit: 30 })).toBe(true);
  });

  it("accepts --app with no locator (defaults to index 0 downstream)", () => {
    expect(ok({ app: "tron" })).toBe(true);
  });

  it("rejects more than one locator (mutually exclusive)", () => {
    expect(ok({ app: "tron", index: 0, path: "m/44'/195'/0'/0/0" })).toBe(false);
    expect(ok({ app: "tron", index: 0, address: "Tabc" })).toBe(false);
  });

  it("coerces --index and --scan-limit from strings", () => {
    const r = walletImportLedgerInput.safeParse({ app: "tron", index: "2", scanLimit: "30" });
    expect(r.success && (r.data as { index?: number }).index).toBe(2);
  });

  it("rejects a hidden-family app (EVM is not currently exposed)", () => {
    expect(ok({ app: "ethereum", index: 0 })).toBe(false);
  });
});
