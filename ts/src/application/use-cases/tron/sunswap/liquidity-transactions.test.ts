import { describe, expect, it, vi } from "vitest";
import { LiquidityTransactions } from "./liquidity-transactions.js";
import { ChainError, normalizeError } from "../../../../domain/errors/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const approval = {
  token: "token",
  symbol: "USDT",
  decimals: 6,
  spender: "spender",
  amount: "10",
  currentAllowance: "0",
};
const scope = {} as TransactionScope;
const network = {} as NetworkDescriptor;
const mode = {
  dryRun: false,
  buildOnly: false,
  permissionId: 0,
  broadcast: true,
  mode: "broadcast" as const,
};

function harness() {
  const run = vi.fn().mockResolvedValue({ stage: "confirmed", txId: "approval-1" });
  const port = {
    approvalDomain: "sunswap",
    allowance: vi.fn(async () => "10"),
    approvalPayload: vi.fn(() => ({ target: "token", method: "approve", parameters: [] })),
  };
  const tx = new LiquidityTransactions(
    port as never,
    { get: () => ({}) } as never,
    { run } as never,
  );
  return { tx, run, port };
}

describe("approval failure progress", () => {
  it("keeps the first approval when signing the second is rejected", async () => {
    const h = harness();
    h.run
      .mockResolvedValueOnce({ stage: "confirmed", txId: "approval-1" })
      .mockRejectedValueOnce(
        new ChainError("signing_rejected", "declined", { deviceStatus: "rejected" }),
      );
    const main = vi.fn();
    await expect(
      h.tx.withApprovals(scope, network, [approval, approval], "owner", mode, undefined, main),
    ).rejects.toMatchObject({
      code: "signing_rejected",
      details: { deviceStatus: "rejected", approvalTxIds: ["approval-1"] },
      message: expect.stringContaining("approval-1"),
    });
    expect(main).not.toHaveBeenCalled();
  });
  it("redacts unknown exceptions while retaining completed approval IDs", async () => {
    const h = harness();
    try {
      await h.tx.withApprovals(scope, network, [approval], "owner", mode, undefined, async () => {
        throw new Error("sensitive-fixture");
      });
      expect.fail("must reject");
    } catch (error) {
      const envelope = normalizeError(error).toEnvelope();
      expect(envelope).toMatchObject({
        code: "internal_error",
        details: { approvalTxIds: ["approval-1"] },
      });
      expect(JSON.stringify(envelope)).not.toContain("sensitive-fixture");
    }
  });
  it("does not invent approval progress if the first signature is rejected", async () => {
    const h = harness();
    const error = new ChainError("signing_rejected", "declined");
    h.run.mockRejectedValueOnce(error);
    await expect(
      h.tx.withApprovals(scope, network, [approval], "owner", mode, undefined, vi.fn()),
    ).rejects.toBe(error);
  });
});
