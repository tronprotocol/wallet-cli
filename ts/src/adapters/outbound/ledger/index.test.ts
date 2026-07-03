import { describe, it, expect, vi } from "vitest";
import { Ledger } from "./index.js";

// The @ledgerhq transport/app modules are imported lazily inside the adapter, so hoisted vi.mock
// applies. closeSpy stands in for the native HID handle: the real bug is that a timed-out device
// call leaks this handle (it is never closed), pinning libuv so the process can't exit.
const { closeSpy } = vi.hoisted(() => ({ closeSpy: vi.fn(async () => {}) }));
vi.mock("@ledgerhq/hw-transport-node-hid", () => ({
  default: { open: async () => ({ close: closeSpy }) },
}));
// Every device APDU never resolves — models an on-device prompt that is never tapped.
vi.mock("@ledgerhq/hw-app-trx", () => ({
  default: class {
    async signPersonalMessage(): Promise<string> {
      return new Promise(() => {});
    }
    async signTransaction(): Promise<string> {
      return new Promise(() => {});
    }
    async getAddress(): Promise<{ publicKey: string; address: string }> {
      return new Promise(() => {});
    }
    async getAppConfiguration(): Promise<{ version: string }> {
      return new Promise(() => {});
    }
  },
}));

const PATH = "m/44'/195'/0'/0/0";
const RAW_TX = { raw_data_hex: "0a02" } as never;

describe("Ledger adapter timeout", () => {
  it("bounds a hung device signMessage by timeoutMs", async () => {
    await expect(new Ledger(20).signMessage("tron", PATH, "hi")).rejects.toMatchObject({ code: "timeout" });
  });

  // Regression: on timeout the adapter must close the transport, otherwise the pending APDU keeps
  // the native HID handle open and the process hangs (violates the deterministic-exit CLI contract).
  it("closes the transport when a hung signMessage times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).signMessage("tron", PATH, "hi")).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung signTransaction times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).signTransaction("tron", PATH, RAW_TX)).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung getAddress times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).getAddress("tron", PATH)).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung appConfig times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).appConfig("tron")).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });
});
