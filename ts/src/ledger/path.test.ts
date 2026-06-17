import { describe, it, expect } from "vitest";
import { resolveLedgerPath } from "./index.js";
import type { Ledger } from "./index.js";

/** a fake device: every path derives a deterministic address; some paths are pinned. */
function fakeLedger(pinned: Record<string, string> = {}): Ledger {
  return {
    async getAddress(_family: string, path: string): Promise<string> {
      return pinned[path] ?? `addr@${path}`;
    },
  } as unknown as Ledger;
}

describe("resolveLedgerPath", () => {
  it("maps --index to the BIP44 account path (no device call)", async () => {
    const path = await resolveLedgerPath(fakeLedger(), "evm", { index: 3 });
    expect(path).toBe("m/44'/60'/3'/0/0");
  });

  it("accepts an explicit --path whose coin_type matches the app", async () => {
    const path = await resolveLedgerPath(fakeLedger(), "tron", { path: "m/44'/195'/2'/0/0" });
    expect(path).toBe("m/44'/195'/2'/0/0");
  });

  it("rejects a --path whose coin_type contradicts the app", async () => {
    await expect(resolveLedgerPath(fakeLedger(), "evm", { path: "m/44'/195'/0'/0/0" })).rejects.toMatchObject({
      code: "invalid_option",
    });
  });

  it("locates a known --address by bounded scan and returns its path", async () => {
    const target = "addr@m/44'/60'/2'/0/0";
    const path = await resolveLedgerPath(fakeLedger(), "evm", { address: target, scanLimit: 10 });
    expect(path).toBe("m/44'/60'/2'/0/0");
  });

  it("throws ledger_address_not_found past the scan limit, citing the recovery flags", async () => {
    const err = await resolveLedgerPath(fakeLedger(), "evm", { address: "0xnope", scanLimit: 3 }).catch((e) => e);
    expect(err.code).toBe("ledger_address_not_found");
    expect(err.message).toContain("--scan-limit");
    expect(err.message).toContain("--index");
    expect(err.message).toContain("--path");
  });
});
