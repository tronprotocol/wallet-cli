import { describe, expect, it, vi } from "vitest";
import { WalletX402Signer } from "./wallet-signer.js";
import type { Signer } from "../../../domain/types/index.js";

const payload = {
  domain: { name: "Token", chainId: 56 },
  types: { Pay: [{ name: "value", type: "uint256" }] },
  primaryType: "Pay",
  message: { value: "1" },
};

describe("WalletX402Signer", () => {
  it("returns only the wallet signature to the x402 SDK", async () => {
    const signer = {
      kind: "software",
      address: "0x1111111111111111111111111111111111111111",
      signTypedData: vi.fn(async () => ({
        signature: "0xsig",
        digest: "0xhash",
        primaryType: "Pay",
      })),
    } as unknown as Signer;
    const scope = { timeoutMs: 1000, emit: vi.fn() };
    const bridge = new WalletX402Signer(signer, scope);

    await expect(bridge.signTypedData(payload)).resolves.toBe("0xsig");
    expect(bridge.address).toBe(signer.address);
    expect(await bridge.getAddress()).toBe(signer.address);
  });

  it("preserves Ledger precheck and awaiting-device behavior", async () => {
    const signer = {
      kind: "device",
      address: "TAddress",
      precheck: vi.fn(async () => undefined),
      signTypedData: vi.fn(async () => ({ signature: "abcd", digest: "hash", primaryType: "Pay" })),
    } as unknown as Signer;
    const scope = { timeoutMs: 1000, emit: vi.fn() };
    await new WalletX402Signer(signer, scope).signTypedData(payload);
    expect(signer.precheck).toHaveBeenCalledOnce();
    expect(scope.emit).toHaveBeenCalledWith({ type: "awaiting_device", reason: "sign" });
  });
});
