import { describe, expect, it, vi } from "vitest";
import { LiquidityTransactions } from "./liquidity-transactions.js";
import { ChainError, normalizeError } from "../../../../domain/errors/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { AccountRef, NetworkDescriptor, TxOutcome } from "../../../../domain/types/index.js";
import type { TxPipelineParams } from "../../../services/pipeline/index.js";

const approval = {
  token: "token",
  symbol: "USDT",
  decimals: 6,
  spender: "spender",
  amount: "10",
  currentAllowance: "0",
};
// The CLI supplies a class instance, including prototype methods and a lazy account getter.
class TestScope implements TransactionScope {
  readonly timeoutMs = 500;
  readonly waitTimeoutMs = 1000;
  #account = "owner" as AccountRef;
  #events: unknown[] = [];
  constructor(readonly wait = false) {}
  get activeAccount(): AccountRef {
    return this.#account;
  }
  resolveAddress(): string {
    return this.#account;
  }
  emit(event: Parameters<TransactionScope["emit"]>[0]): void {
    this.#events.push(event);
  }
  warn(message: Parameters<TransactionScope["warn"]>[0]): void {
    this.#events.push(message);
  }
  get events(): readonly unknown[] {
    return this.#events;
  }
}
const scope = new TestScope();
const network = {} as NetworkDescriptor;
const mode = {
  dryRun: false,
  buildOnly: false,
  permissionId: 0,
  broadcast: true,
  mode: "broadcast" as const,
};

function harness() {
  const run = vi.fn<(p: TxPipelineParams) => Promise<TxOutcome>>().mockResolvedValue({
    stage: "confirmed",
    txId: "approval-1",
  });
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

describe("approval confirmation before the main transaction", () => {
  it.each([false, true])("confirms approvals while preserving caller wait=%s", async (wait) => {
    const h = harness();
    const caller = new TestScope(wait);
    const order: string[] = [];
    let allowance = "0";
    let calls = 0;
    h.port.allowance.mockImplementation(async () => {
      order.push("allowance");
      return allowance;
    });
    h.run.mockImplementation(async (p) => {
      expect(caller.wait).toBe(wait);
      expect(p.account).toBe(caller.activeAccount);
      expect(p.ctx.resolveAddress("tron")).toBe("owner");
      expect(p.ctx.timeoutMs).toBe(caller.timeoutMs);
      expect(p.ctx.waitTimeoutMs).toBe(caller.waitTimeoutMs);
      if (++calls === 3) {
        expect(p.ctx).toBe(caller);
        order.push("main");
        return { stage: p.ctx.wait ? "confirmed" : "submitted", txId: "main" };
      }
      order.push("approval");
      p.ctx.emit({ type: "signed" });
      p.ctx.warn("approval warning");
      if (!p.ctx.wait) return { stage: "submitted", txId: "approval-1" };
      allowance = "10";
      order.push("confirmed");
      return { stage: "confirmed", txId: "approval-1" };
    });
    const outcome = await h.tx.withApprovals(
      caller,
      network,
      [approval, approval],
      "owner",
      mode,
      undefined,
      () =>
        h.tx.run(
          caller,
          network,
          { target: "router", method: "swap", parameters: [] },
          {
            mode,
            estimable: true,
          },
        ),
    );
    expect(outcome).toMatchObject({ stage: wait ? "confirmed" : "submitted", txId: "main" });
    expect(order).toEqual([
      "approval",
      "confirmed",
      "allowance",
      "approval",
      "confirmed",
      "allowance",
      "main",
    ]);
    expect(caller.events).toEqual([
      { type: "signed" },
      "approval warning",
      { type: "signed" },
      "approval warning",
    ]);
    expect(caller.wait).toBe(wait);
  });

  it("stops on an unconfirmed approval, retaining all submitted IDs even if allowance is sufficient", async () => {
    const h = harness();
    h.run
      .mockResolvedValueOnce({ stage: "confirmed", txId: "approval-1" })
      .mockResolvedValueOnce({ stage: "submitted", txId: "approval-2" });
    const main = vi.fn();
    await expect(
      h.tx.withApprovals(
        scope,
        network,
        [approval, approval, approval],
        "owner",
        mode,
        undefined,
        main,
      ),
    ).rejects.toMatchObject({
      code: "timeout",
      message: expect.stringMatching(
        /not confirmed.*1000ms.*main transaction was not sent.*may still confirm/,
      ),
      details: { approvalTxIds: ["approval-1", "approval-2"] },
    });
    expect(h.port.allowance).toHaveBeenCalledTimes(1);
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(main).not.toHaveBeenCalled();
  });

  it("leaves an approval-free operation unchanged", async () => {
    const h = harness();
    const main = vi.fn().mockResolvedValue("main");
    await expect(
      h.tx.withApprovals(scope, network, [], "owner", mode, undefined, main),
    ).resolves.toBe("main");
    expect(main).toHaveBeenCalledWith([]);
    expect(h.run).not.toHaveBeenCalled();
    expect(h.port.allowance).not.toHaveBeenCalled();
  });

  it.each(["dry-run", "build-only", "sign-only"] as const)(
    "does not force waiting in %s mode",
    async (executionMode) => {
      const h = harness();
      await h.tx.sendApprovals(
        scope,
        network,
        [approval],
        "owner",
        {
          ...mode,
          mode: executionMode,
          dryRun: executionMode === "dry-run",
          buildOnly: executionMode === "build-only",
          broadcast: false,
        },
        undefined,
      );
      expect(h.run.mock.calls[0]![0].ctx).toBe(scope);
      expect(scope.wait).toBe(false);
    },
  );
});

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

/**
 * An approval that lands on chain but fails (a revert, out of energy) must stop the flow: the main
 * call would spend the allowance it never got and revert too, after its own fee was paid.
 */
describe("an approval that fails on chain", () => {
  it("refuses with execution_reverted, keeps its txId, and never runs the main call", async () => {
    const h = harness();
    h.run.mockResolvedValueOnce({ stage: "failed", txId: "approve-tx", result: "REVERT" });
    h.port.allowance.mockResolvedValue("0");
    const main = vi.fn();
    await expect(
      h.tx.withApprovals(scope, network, [approval], "owner", mode, undefined, main),
    ).rejects.toMatchObject({
      code: "execution_reverted",
      details: { approvalTxIds: ["approve-tx"] },
      message: expect.stringContaining("failed on chain"),
    });
    expect(main).not.toHaveBeenCalled();
    expect(h.run).toHaveBeenCalledTimes(1);
  });
});
