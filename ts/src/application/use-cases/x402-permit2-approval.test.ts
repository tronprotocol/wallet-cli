import { describe, expect, it, vi } from "vitest";
import { X402Permit2Approvals } from "./x402-permit2-approval.js";
import type { TxPipeline, TronTxPipelineParams } from "../services/pipeline/index.js";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";
import type { TxOutcome } from "../../domain/types/index.js";
import { TransportError } from "../../domain/errors/index.js";

const PAYER = "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ";
const PERMIT2 = "TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h";
const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const TX_ID = "ab".repeat(32);
const NETWORK = { id: "tron:3448148188", family: "tron" } as never;
const FACTS = { permit2: { spender: PERMIT2, tokens: [USDT] }, tokenDecimals: () => 6 };

function harness(outcome: TxOutcome | Error, allowanceAfter = "1000000") {
  const gateway = {
    triggerSmartContract: vi.fn(async () => ({ txID: TX_ID })),
    estimateResources: vi.fn(async () => ({ feeModel: "tron-resource", energy: 1 })),
  };
  const gateways = { get: vi.fn(() => gateway) } as unknown as ChainGatewayProvider;
  const run = vi.fn(async (_params: TronTxPipelineParams) => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  const scope = {
    activeAccount: "payer",
    timeoutMs: 1000,
    wait: false,
    waitTimeoutMs: 60_000,
    resolveAddress: () => PAYER,
    emit: vi.fn(),
    warn: vi.fn(),
  };
  const readAllowance = vi.fn(async () => allowanceAfter);
  const approver = new X402Permit2Approvals(gateways, {
    runTron: run,
  } as unknown as TxPipeline).approver(scope, NETWORK, FACTS);
  const request = { token: USDT, spender: PERMIT2, requiredAllowance: "1000000", readAllowance };
  return { approver, request, run, gateway, readAllowance };
}

describe("X402Permit2Approvals", () => {
  it("submits approve(Permit2, MaxUint256) through the TRON pipeline and waits for it", async () => {
    const h = harness({ stage: "confirmed", txId: TX_ID });

    await expect(h.approver.approve(h.request)).resolves.toEqual({
      txId: TX_ID,
      token: USDT,
      spender: PERMIT2,
      allowance: "unlimited",
      feeLimitSun: 100_000_000,
    });
    const params = h.run.mock.calls[0]![0];
    expect(params).toMatchObject({ mode: "broadcast", permissionId: 0 });
    expect(params.broadcaster).toBe(h.gateway);
    expect(params.ctx.wait).toBe(true);
    expect(params.confirm).toEqual(expect.any(Function));
    expect(params.preflight).toEqual(expect.any(Function));
    await params.build(PAYER);
    expect(h.gateway.triggerSmartContract).toHaveBeenCalledWith(
      PAYER,
      USDT,
      "approve(address,uint256)",
      [
        { type: "address", value: PERMIT2 },
        { type: "uint256", value: ((1n << 256n) - 1n).toString() },
      ],
      { callValue: "0", feeLimit: "100000000", permissionId: 0 },
    );
    expect(h.readAllowance).toHaveBeenCalledOnce();
  });

  it.each([
    ["a token outside the payment tokens", { token: PAYER }],
    ["a spender other than Permit2", { spender: PAYER }],
  ])("refuses %s before building anything", async (_label, over) => {
    const h = harness({ stage: "confirmed", txId: TX_ID });

    await expect(h.approver.approve({ ...h.request, ...over })).rejects.toMatchObject({
      code: "signed_payload_mismatch",
    });
    expect(h.run).not.toHaveBeenCalled();
  });

  it("reports a reverted approval with its transaction id", async () => {
    const h = harness({ stage: "failed", txId: TX_ID, result: "REVERT" });

    await expect(h.approver.approve(h.request)).rejects.toMatchObject({
      code: "execution_reverted",
      details: { txId: TX_ID },
    });
    expect(h.readAllowance).not.toHaveBeenCalled();
  });

  it("reports an unconfirmed approval as a timeout with its transaction id", async () => {
    const h = harness({ stage: "submitted", txId: TX_ID });

    await expect(h.approver.approve(h.request)).rejects.toMatchObject({
      code: "timeout",
      details: { txId: TX_ID },
    });
  });

  it("refuses when the confirmed approval left too little allowance", async () => {
    const h = harness({ stage: "confirmed", txId: TX_ID }, "999999");

    await expect(h.approver.approve(h.request)).rejects.toMatchObject({
      code: "execution_reverted",
      details: { txId: TX_ID },
    });
  });

  it("keeps the pipeline's outcome-unknown error and its transaction id", async () => {
    const h = harness(new TransportError("rpc_error", "node unreachable", { txId: TX_ID }));

    await expect(h.approver.approve(h.request)).rejects.toMatchObject({
      code: "rpc_error",
      details: { txId: TX_ID },
    });
  });
});
