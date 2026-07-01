import { describe, it, expect } from "vitest";
import { TronTransactionService } from "./transaction-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronTxInfo, TronTx } from "../../ports/chain/tron-gateway.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NET = { id: "tron:nile", family: "tron", chainId: "nile" } as unknown as NetworkDescriptor;

// Minimal fake gateway: status() only touches the two lookup endpoints.
function service(opts: { tx?: TronTx | Error; info?: TronTxInfo }) {
  const gateway = {
    async getTransactionById(): Promise<TronTx> {
      if (opts.tx instanceof Error) throw opts.tx;
      if (!opts.tx) throw new Error("Transaction not found");
      return opts.tx;
    },
    async getTransactionInfoById(): Promise<TronTxInfo> {
      return opts.info ?? {};
    },
  } as unknown as TronGateway;
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  return new TronTransactionService(gateways, {} as never, {} as never);
}

describe("TronTransactionService.status — four-state", () => {
  it("confirmed: node knows tx + block + SUCCESS receipt", async () => {
    const s = await service({ tx: { txID: "abc" } as TronTx, info: { blockNumber: 42, receipt: { result: "SUCCESS" } } }).status(NET, "abc");
    expect(s.state).toBe("confirmed");
    expect(s.confirmed).toBe(true);
    expect(s.failed).toBe(false);
    expect(s.blockNumber).toBe(42);
  });

  it("failed: has block but receipt result ≠ SUCCESS", async () => {
    const s = await service({ tx: { txID: "abc" } as TronTx, info: { blockNumber: 42, receipt: { result: "REVERT" } } }).status(NET, "abc");
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
    const s = await service({ tx: new Error("Transaction not found"), info: {} }).status(NET, "abc");
    expect(s.state).toBe("not_found");
    expect(s.confirmed).toBe(false);
  });

  it("not_found: getTransactionById resolves without a txID", async () => {
    const s = await service({ tx: {} as TronTx, info: {} }).status(NET, "abc");
    expect(s.state).toBe("not_found");
  });
});
