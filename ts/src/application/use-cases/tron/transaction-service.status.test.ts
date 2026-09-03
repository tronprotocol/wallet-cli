import { describe, it, expect } from "vitest";
import { TronTransactionService } from "./transaction-service.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronTxInfo, TronTx } from "../../ports/chain/tron-gateway.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NET = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
} as unknown as NetworkDescriptor;

// Minimal fake gateway: status() only touches the two lookup endpoints.
function service(opts: { tx?: TronTx | Error; info?: TronTxInfo | Error; head?: number | Error }) {
  const gateway = {
    async getTransactionById(): Promise<TronTx> {
      if (opts.tx instanceof Error) throw opts.tx;
      if (!opts.tx) throw new Error("Transaction not found");
      return opts.tx;
    },
    async getTransactionInfoById(): Promise<TronTxInfo> {
      if (opts.info instanceof Error) throw opts.info;
      return opts.info ?? {};
    },
    async getBlock(): Promise<unknown> {
      if (opts.head instanceof Error) throw opts.head;
      if (opts.head === undefined) throw new Error("no head configured");
      return { block_header: { raw_data: { number: opts.head } } };
    },
  } as unknown as TronGateway;
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  return new TronTransactionService(gateways, {} as never, {} as never, {} as never);
}

describe("TronTransactionService.status — four-state", () => {
  it("confirmed: node knows tx + block + SUCCESS receipt", async () => {
    const s = await service({
      tx: { txID: "abc" } as TronTx,
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
    }).status(NET, "abc");
    expect(s.state).toBe("confirmed");
    expect(s.confirmed).toBe(true);
    expect(s.failed).toBe(false);
    expect(s.blockNumber).toBe(42);
  });

  it("failed: has block but receipt result ≠ SUCCESS", async () => {
    const s = await service({
      tx: { txID: "abc" } as TronTx,
      info: { blockNumber: 42, receipt: { result: "REVERT" } },
    }).status(NET, "abc");
    expect(s.state).toBe("failed");
    expect(s.failed).toBe(true);
  });

  it("pending: node knows tx (getTransactionById) but no block yet", async () => {
    const s = await service({ tx: { txID: "abc" } as TronTx, info: {} }).status(NET, "abc");
    expect(s.state).toBe("pending");
    expect(s.confirmed).toBe(false);
    expect(s.failed).toBe(false);
  });

  it("not_found: node throws Transaction not found and no info", async () => {
    const s = await service({ tx: new Error("Transaction not found"), info: {} }).status(
      NET,
      "abc",
    );
    expect(s.state).toBe("not_found");
    expect(s.confirmed).toBe(false);
  });

  it("not_found: getTransactionById resolves without a txID", async () => {
    const s = await service({ tx: {} as TronTx, info: {} }).status(NET, "abc");
    expect(s.state).toBe("not_found");
  });

  it("fails instead of reporting not_found when the node cannot be reached", async () => {
    // getTransactionInfoById resolving is what proves the node answered at all. If it rejects,
    // nothing here knows whether the transaction exists — and `not_found` in the four-state model
    // means "keep polling", which would loop forever against a node that is simply down.
    await expect(
      service({
        tx: new ChainError("rpc_error", "boom"),
        info: new ChainError("rpc_error", "boom"),
      }).status(NET, "abc"),
    ).rejects.toMatchObject({ code: "rpc_error" });
  });

  it("still reports not_found when the node answers and simply has no such transaction", async () => {
    // The node is healthy: getTransactionInfoById resolved (Nile returns {} for an unknown hash).
    // getTransactionById rejecting is then a fact about the transaction, not about the node.
    const s = await service({
      tx: new Error("Transaction not found"),
      info: {},
    }).status(NET, "abc");
    expect(s.state).toBe("not_found");
  });
});

/**
 * `Confirmations` is NOT EVM-specific. `--wait` stops at the
 * receipt, so how deep is deep enough is the caller's judgement to make, and this is the number
 * they make it with.
 */
describe("TronTransactionService.status — confirmations", () => {
  it("reports head minus the transaction's block", async () => {
    const s = await service({
      tx: { txID: "abc" } as TronTx,
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
      head: 78,
    }).status(NET, "abc");

    expect(s.confirmations).toBe(36);
  });

  // The including block is not counted, so a transaction in the head block reports zero.
  it("reports zero for a transaction in the head block", async () => {
    const s = await service({
      tx: { txID: "abc" } as TronTx,
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
      head: 42,
    }).status(NET, "abc");

    expect(s.confirmations).toBe(0);
  });

  // Absent, not zero: "we could not ask" is a different claim from "nothing on top yet", and the
  // extra call must never cost the answer the command was actually asked for.
  it("omits the field when the head could not be read, and still answers", async () => {
    const s = await service({
      tx: { txID: "abc" } as TronTx,
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
      head: new Error("node unreachable"),
    }).status(NET, "abc");

    expect(s.state).toBe("confirmed");
    expect(s.confirmations).toBeUndefined();
  });

  it("omits the field while the transaction has no block", async () => {
    const s = await service({ tx: { txID: "abc" } as TronTx, info: {}, head: 78 }).status(
      NET,
      "abc",
    );

    expect(s.state).toBe("pending");
    expect(s.confirmations).toBeUndefined();
  });
});
