import { describe, it, expect } from "vitest";
import { walletImportLedgerInput } from "./wallet.js";

const ok = (v: unknown) => walletImportLedgerInput.safeParse(v).success;

describe("wallet import-ledger contract", () => {
  it("requires --app", () => {
    expect(ok({ index: 0 })).toBe(false);
  });

  it("accepts exactly one locator", () => {
    expect(ok({ app: "ethereum", index: 0 })).toBe(true);
    expect(ok({ app: "tron", path: "m/44'/195'/0'/0/0" })).toBe(true);
    expect(ok({ app: "ethereum", address: "0xabc", scanLimit: 30 })).toBe(true);
  });

  it("accepts --app with no locator (defaults to index 0 downstream)", () => {
    expect(ok({ app: "ethereum" })).toBe(true);
  });

  it("rejects more than one locator (mutually exclusive)", () => {
    expect(ok({ app: "ethereum", index: 0, path: "m/44'/60'/0'/0/0" })).toBe(false);
    expect(ok({ app: "ethereum", index: 0, address: "0xabc" })).toBe(false);
  });

  it("coerces --index and --scan-limit from strings", () => {
    const r = walletImportLedgerInput.safeParse({ app: "ethereum", index: "2", scanLimit: "30" });
    expect(r.success && (r.data as { index?: number }).index).toBe(2);
  });
});
