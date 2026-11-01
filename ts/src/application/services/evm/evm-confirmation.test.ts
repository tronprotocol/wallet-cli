import { describe, it, expect, vi } from "vitest";
import { evmConfirmation } from "./evm-confirmation.js";
import type { EvmGateway } from "../../ports/chain/evm/evm-gateway.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { CommandDeadline } from "../command-deadline.js";

const HASH = `0x${"ab".repeat(32)}`;

function scope(limitMs = 50): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => "0xADDR",
    deadline: new CommandDeadline(limitMs),
    wait: true,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

const gatewayReturning = (...receipts: Array<Record<string, unknown> | null>) => {
  const queue = [...receipts];
  return {
    getTransactionReceipt: vi.fn(async () => (queue.length > 1 ? queue.shift()! : queue[0]!)),
  } as unknown as EvmGateway;
};

describe("evmConfirmation", () => {
  it("reports a mined, successful transaction as confirmed", async () => {
    const out = await evmConfirmation(
      gatewayReturning({
        success: true,
        gasUsed: "21000",
        feeWei: "22436119209000",
        blockNumber: 11551817,
      }),
      scope(),
    )(HASH);

    expect(out).toMatchObject({
      confirmed: true,
      failed: false,
      blockNumber: 11551817,
      gasUsed: "21000",
      feeWei: "22436119209000",
    });
  });

  it("reports a reverted transaction as failed, never as confirmed", async () => {
    const out = await evmConfirmation(
      gatewayReturning({ success: false, gasUsed: "21000", feeWei: "500", blockNumber: 42 }),
      scope(),
    )(HASH);

    expect(out).toMatchObject({ confirmed: true, failed: true, blockNumber: 42 });
    expect(out!.feeWei).toBe("500");
  });

  it("keeps polling while the transaction is still pending", async () => {
    const gateway = gatewayReturning(null, { success: true, blockNumber: 7 });
    const out = await evmConfirmation(gateway, scope(5_000))(HASH);

    expect(out).toMatchObject({ confirmed: true, blockNumber: 7 });
    expect(
      (gateway.getTransactionReceipt as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(1);
  });

  it("gives up at the wait timeout rather than hanging", async () => {
    const out = await evmConfirmation(gatewayReturning(null), scope(30))(HASH);

    expect(out).toBeUndefined();
  });

  it("treats an RPC failure as not-yet-confirmed rather than throwing", async () => {
    const gateway = {
      getTransactionReceipt: vi.fn(async () => {
        throw new Error("endpoint down");
      }),
    } as unknown as EvmGateway;

    await expect(evmConfirmation(gateway, scope(30))(HASH)).resolves.toBeUndefined();
  });

  it("carries a deployed contract address through when the receipt names one", async () => {
    const out = await evmConfirmation(
      gatewayReturning({ success: true, blockNumber: 1, contractAddress: "0xdead" }),
      scope(),
    )(HASH);

    expect(out!.contractAddress).toBe("0xdead");
  });
});

describe("evmConfirmation bounds each poll by the wait budget", () => {
  it("ends the wait at the deadline even when the node call never settles", async () => {
    let calls = 0;
    const gateway = {
      getTransactionReceipt: () => {
        calls += 1;
        return new Promise(() => {});
      },
    } as unknown as EvmGateway;

    expect(await evmConfirmation(gateway, scope(30))(HASH)).toBeUndefined();
    expect(calls).toBe(1);
  });
});
