import { describe, it, expect } from "vitest";
import { TronTransactionService } from "./transaction-service.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { NetworkDescriptor, TronTransactionArtifact } from "../../../domain/types/index.js";
import {
  parseTronTx,
  parseTronTxInfo,
} from "../../../adapters/outbound/chain/tron/tron-responses.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { submitAndStage } from "../../services/submit-and-stage.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const NO_DEADLINE = new CommandDeadline(0);

const NET = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
} as unknown as NetworkDescriptor;

// Node JSON goes through the adapter's parsers, so tests see the facts the adapter derives.
function nodeGateway(opts: { tx?: object | Error; info?: object | Error; head?: number | Error }) {
  return {
    async getTransactionById() {
      if (opts.tx instanceof Error) throw opts.tx;
      if (!opts.tx) throw new Error("Transaction not found");
      return parseTronTx(opts.tx);
    },
    async getTransactionInfoById() {
      if (opts.info instanceof Error) throw opts.info;
      return parseTronTxInfo(opts.info ?? {});
    },
    async getHeadBlock() {
      if (opts.head instanceof Error) throw opts.head;
      if (opts.head === undefined) throw new Error("no head configured");
      return { number: opts.head, timestampMs: 0 };
    },
  } as unknown as TronGateway;
}

function service(opts: { tx?: object | Error; info?: object | Error; head?: number | Error }) {
  const gateway = nodeGateway(opts);
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  return new TronTransactionService(gateways, {} as never, {} as never, {} as never);
}

describe("TronTransactionService.status — four-state", () => {
  it("confirmed: node knows tx + block + SUCCESS receipt", async () => {
    const s = await service({
      tx: { txID: "abc" },
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
    }).status(NO_DEADLINE, NET, "abc");
    expect(s.state).toBe("confirmed");
    expect(s.confirmed).toBe(true);
    expect(s.failed).toBe(false);
    expect(s.blockNumber).toBe(42);
  });

  it("failed: has block but receipt result ≠ SUCCESS", async () => {
    const s = await service({
      tx: { txID: "abc" },
      info: { blockNumber: 42, receipt: { result: "REVERT" } },
    }).status(NO_DEADLINE, NET, "abc");
    expect(s.state).toBe("failed");
    expect(s.failed).toBe(true);
  });

  it("pending: node knows tx (getTransactionById) but no block yet", async () => {
    const s = await service({ tx: { txID: "abc" }, info: {} }).status(NO_DEADLINE, NET, "abc");
    expect(s.state).toBe("pending");
    expect(s.confirmed).toBe(false);
    expect(s.failed).toBe(false);
  });

  it("not_found: node throws Transaction not found and no info", async () => {
    const s = await service({ tx: new Error("Transaction not found"), info: {} }).status(
      NO_DEADLINE,
      NET,
      "abc",
    );
    expect(s.state).toBe("not_found");
    expect(s.confirmed).toBe(false);
  });

  it("not_found: getTransactionById resolves without a txID", async () => {
    const s = await service({ tx: {}, info: {} }).status(NO_DEADLINE, NET, "abc");
    expect(s.state).toBe("not_found");
  });

  it("fails instead of reporting not_found when the node cannot be reached", async () => {
    await expect(
      service({
        tx: new ChainError("rpc_error", "boom"),
        info: new ChainError("rpc_error", "boom"),
      }).status(NO_DEADLINE, NET, "abc"),
    ).rejects.toMatchObject({ code: "rpc_error" });
  });

  it("still reports not_found when the node answers and simply has no such transaction", async () => {
    const s = await service({
      tx: new Error("Transaction not found"),
      info: {},
    }).status(NO_DEADLINE, NET, "abc");
    expect(s.state).toBe("not_found");
  });
});

describe("tx status and --wait read one execution fact", () => {
  const NATIVE: TronTransactionArtifact = {
    txID: "abc",
    raw_data: { contract: [{ type: "TransferContract" }] },
    raw_data_hex: "",
  };
  const waitScope = {
    wait: true,
    deadline: new CommandDeadline(0),
    activeAccount: {} as never,
    resolveAddress: () => "T",
    emit: () => {},
    warn: () => {},
  };

  it.each([
    [{ blockNumber: 42, result: "FAILED", receipt: {} }, "failed"],
    [{ blockNumber: 42, receipt: { result: "DEFAULT" } }, "confirmed"],
    [{ blockNumber: 42, receipt: { result: "REVERT" } }, "failed"],
    [{ blockNumber: 42, receipt: { result: "SUCCESS" } }, "confirmed"],
  ])("%j → %s in both", async (info, expected) => {
    const status = await service({ tx: { txID: "abc" }, info }).status(NO_DEADLINE, NET, "abc");
    const gateway = nodeGateway({ info });
    const waited = await submitAndStage(
      waitScope,
      "abc",
      async () => ({ txId: "abc" }),
      (id) => tronConfirmation(gateway, waitScope)(id, NATIVE),
    );

    expect(status.state).toBe(expected);
    expect(waited.stage).toBe(expected);
  });
});

describe("TronTransactionService.info status", () => {
  it.each([
    [{ blockNumber: 42, result: "FAILED", receipt: {} }, "failed"],
    [{ blockNumber: 42, receipt: { result: "OUT_OF_ENERGY" } }, "out_of_energy"],
    [{ blockNumber: 42, receipt: { result: "SUCCESS" } }, "success"],
    [{ blockNumber: 42 }, "success"],
  ])("%j → %s", async (info, expected) => {
    const tx = { txID: "abc", ret: [{ contractRet: "SUCCESS" }] };
    const view = await service({ tx, info, head: 50 }).info(NO_DEADLINE, NET, "abc");

    expect(view.status).toBe(expected);
    expect(view.info).toBe(info);
    expect(view.transaction).toBe(tx);
  });
});

describe("TronTransactionService.status — confirmations", () => {
  it("reports head minus the transaction's block", async () => {
    const s = await service({
      tx: { txID: "abc" },
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
      head: 78,
    }).status(NO_DEADLINE, NET, "abc");

    expect(s.confirmations).toBe(36);
  });

  it("reports zero for a transaction in the head block", async () => {
    const s = await service({
      tx: { txID: "abc" },
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
      head: 42,
    }).status(NO_DEADLINE, NET, "abc");

    expect(s.confirmations).toBe(0);
  });

  it("omits the field when the head could not be read, and still answers", async () => {
    const s = await service({
      tx: { txID: "abc" },
      info: { blockNumber: 42, receipt: { result: "SUCCESS" } },
      head: new Error("node unreachable"),
    }).status(NO_DEADLINE, NET, "abc");

    expect(s.state).toBe("confirmed");
    expect(s.confirmations).toBeUndefined();
  });

  it("omits the field while the transaction has no block", async () => {
    const s = await service({ tx: { txID: "abc" }, info: {}, head: 78 }).status(
      NO_DEADLINE,
      NET,
      "abc",
    );

    expect(s.state).toBe("pending");
    expect(s.confirmations).toBeUndefined();
  });
});
