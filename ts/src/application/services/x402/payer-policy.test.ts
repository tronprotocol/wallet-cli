import { describe, expect, it, vi } from "vitest";
import { withPayerPolicy, type PayerPolicy } from "./payer-policy.js";
import type { DecodedEvmApprove } from "../../contracts/x402-payer.js";

const TOKEN = "0x55d398326f99059fF775485246999027B3197955";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const EVM_POLICY: PayerPolicy = {
  family: "evm",
  approveIntent: { spender: PERMIT2, tokens: [TOKEN] },
};
const APPROVE: DecodedEvmApprove = {
  token: TOKEN,
  valueWei: "0",
  unlimitedApproveSpender: PERMIT2,
};

const payerOf = () => ({
  address: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
  signTypedData: vi.fn(),
  signTransaction: vi.fn(async (tx: unknown) => tx),
});

describe("withPayerPolicy", () => {
  it("refuses a plain TRON transaction without signing it", async () => {
    const payer = payerOf();

    await expect(
      withPayerPolicy(payer, { family: "tron" }).signTransaction({ txID: "ab" }, APPROVE),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    expect(payer.signTransaction).not.toHaveBeenCalled();
  });

  it("passes the EVM Permit2 approve to the payer", async () => {
    const payer = payerOf();

    await withPayerPolicy(payer, EVM_POLICY).signTransaction({ to: TOKEN }, APPROVE);
    expect(payer.signTransaction).toHaveBeenCalledWith({ to: TOKEN });
  });

  it.each<[string, PayerPolicy, DecodedEvmApprove]>([
    ["no approve was requested", { family: "evm" }, APPROVE],
    ["a token outside the payment tokens", EVM_POLICY, { ...APPROVE, token: PERMIT2 }],
    ["a contract creation", EVM_POLICY, { valueWei: "0", unlimitedApproveSpender: PERMIT2 }],
    ["a native value", EVM_POLICY, { ...APPROVE, valueWei: "1" }],
    ["a malformed value", EVM_POLICY, { ...APPROVE, valueWei: "malformed" }],
    [
      "calldata other than approve(Permit2, MaxUint256)",
      EVM_POLICY,
      { token: TOKEN, valueWei: "0" },
    ],
    ["another spender", EVM_POLICY, { ...APPROVE, unlimitedApproveSpender: TOKEN }],
  ])("refuses an EVM transaction with %s without signing it", async (_label, policy, decoded) => {
    const payer = payerOf();

    await expect(
      withPayerPolicy(payer, policy).signTransaction({ to: TOKEN }, decoded),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    expect(payer.signTransaction).not.toHaveBeenCalled();
  });
});
