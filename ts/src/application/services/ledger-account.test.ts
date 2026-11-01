import { CommandDeadline } from "./command-deadline.js";
import { describe, it, expect } from "vitest";
import { resolveLedgerPath } from "./ledger-account.js";
import type { LedgerDevice } from "../ports/ledger-device.js";
import { errorEnvelope } from "../../adapters/inbound/cli/output/errors.js";

const NO_DEADLINE = new CommandDeadline(0);

function fakeLedger(pinned: Record<string, string> = {}): LedgerDevice {
  return {
    async getAddress(_family: string, path: string): Promise<string> {
      return pinned[path] ?? `addr@${path}`;
    },
  } as unknown as LedgerDevice;
}

describe("resolveLedgerPath", () => {
  it("maps --index to the BIP44 account path (no device call)", async () => {
    const path = await resolveLedgerPath(NO_DEADLINE, fakeLedger(), "tron", { index: 3 });
    expect(path).toBe("m/44'/195'/3'/0/0");
  });

  it("accepts an explicit --path whose coin_type matches the app", async () => {
    const path = await resolveLedgerPath(NO_DEADLINE, fakeLedger(), "tron", {
      path: "m/44'/195'/2'/0/0",
    });
    expect(path).toBe("m/44'/195'/2'/0/0");
  });

  it("rejects a --path whose coin_type contradicts the app", async () => {
    const err = await resolveLedgerPath(NO_DEADLINE, fakeLedger(), "tron", {
      path: "m/44'/60'/0'/0/0",
    }).catch((e) => e);
    expect(err.code).toBe("invalid_option");
    expect(errorEnvelope(err).message).toBe(
      "--path coin_type 60 does not match --app tron (expected 195)",
    );
  });

  it("rejects a value that is not a derivation path with invalid_path", async () => {
    for (const bad of ["notapath", "m/44'/195'/garbage", "m/44'/195'", "44'/195'/0'/0/0", ""]) {
      await expect(
        resolveLedgerPath(NO_DEADLINE, fakeLedger(), "tron", { path: bad }),
        bad,
      ).rejects.toMatchObject({ code: "invalid_path" });
    }
  });

  it("locates a known --address by bounded scan and returns its path", async () => {
    const target = "addr@m/44'/195'/2'/0/0";
    const path = await resolveLedgerPath(NO_DEADLINE, fakeLedger(), "tron", {
      address: target,
      scanLimit: 10,
    });
    expect(path).toBe("m/44'/195'/2'/0/0");
  });

  it.each([
    ["lowercase", (a: string) => a.toLowerCase()],
    ["checksummed", (a: string) => a],
  ])("finds a device EVM address given in %s form", async (_label, spell) => {
    const device = "0x52908400098527886E0F7030069857D2E4169EE7";
    const ledger = fakeLedger({ "m/44'/60'/1'/0/0": device.toLowerCase() });
    const path = await resolveLedgerPath(NO_DEADLINE, ledger, "evm", {
      address: spell(device),
      scanLimit: 3,
    });
    expect(path).toBe("m/44'/60'/1'/0/0");
  });

  it("finds a checksummed device EVM address given in lowercase", async () => {
    const device = "0x52908400098527886E0F7030069857D2E4169EE7";
    const ledger = fakeLedger({ "m/44'/60'/2'/0/0": device });
    const path = await resolveLedgerPath(NO_DEADLINE, ledger, "evm", {
      address: device.toLowerCase(),
      scanLimit: 3,
    });
    expect(path).toBe("m/44'/60'/2'/0/0");
  });

  it("throws ledger_address_not_found past the scan limit, citing the recovery flags", async () => {
    const err = await resolveLedgerPath(NO_DEADLINE, fakeLedger(), "tron", {
      address: "Tnope",
      scanLimit: 3,
    }).catch((e) => e);
    expect(err.code).toBe("ledger_address_not_found");
    expect(errorEnvelope(err).message).toBe(
      "address not found among the first 3 Ledger Live accounts; increase --scan-limit, select a known account with --index, or register its exact derivation path with --path",
    );
  });

  it("offers the concise recovery choices without wallet-specific guidance", async () => {
    const err = await resolveLedgerPath(NO_DEADLINE, fakeLedger(), "evm", {
      address: "0xnope",
      scanLimit: 3,
    }).catch((e) => e);
    expect(err.message).toContain("Ledger Live");
    expect(err.message).toContain("increase scanLimit");
    expect(err.message).not.toMatch(/MetaMask|MEW|MyCrypto/);
  });
});
