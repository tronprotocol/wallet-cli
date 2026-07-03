import { describe, it, expect } from "vitest";
import { LedgerSigner } from "./ledger.js";
import type { Ledger } from "../../../adapters/outbound/ledger/index.js";

function fakeLedger(over: Partial<Ledger>): Ledger {
  return {
    async appConfig() { return { version: "1.0.0", ready: true }; },
    async getAddress() { return "0xCACHED"; },
    ...over,
  } as unknown as Ledger;
}

const PATH = "m/44'/195'/0'/0/0";

describe("LedgerSigner.precheck", () => {
  it("passes when the device derives the cached address", async () => {
    const signer = new LedgerSigner(fakeLedger({}), "tron", PATH, "0xCACHED");
    await expect(signer.precheck()).resolves.toBeUndefined();
  });

  it("rejects with wrong_device_seed when the on-device address differs", async () => {
    const signer = new LedgerSigner(fakeLedger({ getAddress: async () => "0xOTHER" }), "tron", PATH, "0xCACHED");
    await expect(signer.precheck()).rejects.toMatchObject({ code: "wrong_device_seed" });
  });

  it("rejects with auth_required when the app is not ready", async () => {
    const ledger = fakeLedger({ appConfig: async () => ({ version: "1.0.0", ready: false }) });
    const signer = new LedgerSigner(ledger, "tron", PATH, "0xCACHED");
    await expect(signer.precheck()).rejects.toMatchObject({ code: "auth_required" });
  });
});
