import { describe, expect, it, vi } from "vitest";
import { withPayerPolicy } from "./payer-policy.js";

const payerOf = () => ({
  address: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
  signTypedData: vi.fn(),
  signTransaction: vi.fn(async (tx: unknown) => tx),
});

describe("withPayerPolicy", () => {
  it("refuses a plain TRON transaction without signing it", async () => {
    const payer = payerOf();

    await expect(
      withPayerPolicy(payer, { family: "tron" }).signTransaction({ txID: "ab" }),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    expect(payer.signTransaction).not.toHaveBeenCalled();
  });

  it("passes an EVM transaction to the payer", async () => {
    const payer = payerOf();

    await withPayerPolicy(payer, { family: "evm" }).signTransaction({ to: "0x1" });
    expect(payer.signTransaction).toHaveBeenCalledWith({ to: "0x1" });
  });
});
