import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline, TronTxPipelineParams } from "../../services/pipeline/index.js";
import { TronTransactionService } from "./transaction-service.js";
import { parseTronTxInfo } from "../../../adapters/outbound/chain/tron/tron-responses.js";
import { sunAmount } from "../../../domain/amounts/index.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const OWNER = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const RECEIVER = "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT";
const NETWORK = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
} satisfies NetworkDescriptor;

function scope(): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => OWNER,
    deadline: new CommandDeadline(0),
    wait: false,

    emit: vi.fn(),
    warn: vi.fn(),
  };
}

describe("TronTransactionService recipient resolution", () => {
  it("builds and estimates against the resolved contact address", async () => {
    const gateway = {
      buildNativeTransfer: vi.fn(async () => ({ txID: "tx" })),
      prepareTransaction: vi.fn((transaction) => transaction),
      encodeTransactionHex: vi.fn(() => "abcd"),
    } as unknown as TronGateway;
    const pipeline = {
      assertCanSign: vi.fn(),
      runTron: vi.fn(async (params: TronTxPipelineParams) => {
        const transaction = await params.build(OWNER);
        return {
          stage: "plan" as const,
          tx: transaction,
          fee: await params.estimate(transaction),
        };
      }),
    } as unknown as TxPipeline;
    const recipients = {
      resolve: vi.fn(() => ({
        address: RECEIVER,
        contactName: "Alice",
      })),
    };
    const service = new TronTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      {} as never,
      pipeline,
      recipients as never,
    );

    const result = await service.send(scope(), NETWORK, {
      to: "alice",
      rawAmount: "1000000",
      feeLimit: sunAmount("100000000"),
      dryRun: true,
    });

    expect(recipients.resolve).toHaveBeenCalledWith("tron", "alice");
    expect(gateway.buildNativeTransfer).toHaveBeenCalledWith(OWNER, RECEIVER, "1000000");
    expect(result).toMatchObject({
      kind: "send",
      mode: "dry-run",
      to: RECEIVER,
      toContact: "Alice",
    });
    expect(pipeline.assertCanSign).not.toHaveBeenCalled();
  });
});

describe("TronTransactionService amount rule", () => {
  it.each(["0", "-1", "1e6"])("refuses rawAmount %s before building", async (rawAmount) => {
    const pipeline = { assertCanSign: vi.fn(), runTron: vi.fn() } as unknown as TxPipeline;
    const service = new TronTransactionService(
      { get: () => ({}) } as unknown as ChainGatewayProvider,
      {} as never,
      pipeline,
      { resolve: () => ({ address: RECEIVER }) } as never,
    );
    await expect(
      service.send(scope(), NETWORK, {
        to: RECEIVER,
        rawAmount,
        feeLimit: sunAmount("1"),
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_amount" });
    expect(pipeline.runTron).not.toHaveBeenCalled();
  });
});

describe("TronTransactionService --token", () => {
  const FOO_A = {
    kind: "trc20",
    id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    symbol: "FOO",
    decimals: 6,
  };
  const FOO_B = { kind: "trc10", id: "1002000", symbol: "foo", decimals: 6 };

  function service(tokens: unknown[]) {
    const pipeline = { assertCanSign: vi.fn(), runTron: vi.fn() } as unknown as TxPipeline;
    const transactions = new TronTransactionService(
      { get: () => ({}) } as unknown as ChainGatewayProvider,
      { effective: () => tokens } as never,
      pipeline,
      { resolve: () => ({ address: RECEIVER }) } as never,
    );
    return { transactions, pipeline };
  }

  it("refuses a symbol that matches two entries before building or signing", async () => {
    const { transactions, pipeline } = service([FOO_A, FOO_B]);
    await expect(
      transactions.send(scope(), NETWORK, {
        to: RECEIVER,
        token: "Foo",
        rawAmount: "1",
        feeLimit: sunAmount("1"),
      }),
    ).rejects.toMatchObject({
      code: "ambiguous_token_symbol",
      parts: expect.arrayContaining([{ input: "contract" }, { input: "assetId" }]),
    });
    expect(pipeline.runTron).not.toHaveBeenCalled();
  });

  it("refuses a symbol outside the book with token_not_in_book", async () => {
    const { transactions, pipeline } = service([FOO_A]);
    await expect(
      transactions.send(scope(), NETWORK, {
        to: RECEIVER,
        token: "BAR",
        rawAmount: "1",
        feeLimit: sunAmount("1"),
      }),
    ).rejects.toMatchObject({ code: "token_not_in_book" });
    expect(pipeline.runTron).not.toHaveBeenCalled();
  });
});

describe("TronTransactionService TRC20 --wait", () => {
  const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

  it("does not confirm a mined TRC20 transfer whose execution result is unknown", async () => {
    const built = { txID: "tx", raw_data: { contract: [{ type: "TriggerSmartContract" }] } };
    const gateway = {
      buildTrc20Transfer: vi.fn(async () => built),
      getTrc20Balance: vi.fn(async () => "1000000"),
      prepareTransaction: vi.fn((transaction) => transaction),
      encodeTransactionHex: vi.fn(() => "abcd"),
      getTransactionInfoById: vi.fn(async () => parseTronTxInfo({ blockNumber: 7, receipt: {} })),
    } as unknown as TronGateway;
    let confirmed: unknown = "not called";
    const pipeline = {
      assertCanSign: vi.fn(),
      runTron: vi.fn(async (params: TronTxPipelineParams) => {
        const transaction = await params.build(OWNER);
        confirmed = await params.confirm!("tx", transaction);
        return { stage: "submitted" as const, txId: "tx" };
      }),
    } as unknown as TxPipeline;
    const service = new TronTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      {} as never,
      pipeline,
      { resolve: () => ({ address: RECEIVER }) } as never,
    );

    await service.send({ ...scope(), wait: true, deadline: new CommandDeadline(10) }, NETWORK, {
      to: RECEIVER,
      contract: CONTRACT,
      rawAmount: "1",
      feeLimit: sunAmount("100000000"),
    });

    expect(confirmed).toBeUndefined();
  });
});

describe("TronTransactionService TRC20 balance pre-check", () => {
  const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

  function send(
    getTrc20Balance: () => Promise<string>,
    mode: "dryRun" | "buildOnly" | "signOnly" | null,
  ) {
    const gateway = {
      getTrc20Balance: vi.fn(getTrc20Balance),
      buildTrc20Transfer: vi.fn(async () => ({ txID: "tx" })),
      estimateResources: vi.fn(),
    };
    const pipeline = {
      assertCanSign: vi.fn(),
      runTron: vi.fn(async (params: TronTxPipelineParams) => {
        const transaction = await params.build(OWNER);
        await params.estimate(transaction);
        return { stage: "plan" as const, tx: transaction, fee: {} };
      }),
    } as unknown as TxPipeline;
    const service = new TronTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      {} as never,
      pipeline,
      { resolve: () => ({ address: RECEIVER }) } as never,
    );
    const run = service.send(scope(), NETWORK, {
      to: RECEIVER,
      contract: CONTRACT,
      rawAmount: "1000001",
      feeLimit: sunAmount("100000000"),
      ...(mode ? { [mode]: true } : {}),
    });
    return { gateway, run };
  }

  it.each(["dryRun", "buildOnly", "signOnly", null] as const)(
    "refuses a transfer above the token balance before building or estimating (%s)",
    async (mode) => {
      const { gateway, run } = send(async () => "1000000", mode);
      await expect(run).rejects.toMatchObject({ code: "insufficient_token_balance" });
      expect(gateway.getTrc20Balance).toHaveBeenCalledWith(CONTRACT, OWNER);
      expect(gateway.buildTrc20Transfer).not.toHaveBeenCalled();
      expect(gateway.estimateResources).not.toHaveBeenCalled();
    },
  );

  it("keeps the error of a failed balance read", async () => {
    const failure = Object.assign(new Error("node down"), { code: "rpc_error" });
    const { gateway, run } = send(async () => {
      throw failure;
    }, "dryRun");
    await expect(run).rejects.toBe(failure);
    expect(gateway.buildTrc20Transfer).not.toHaveBeenCalled();
  });

  it("builds when the balance covers the amount", async () => {
    const { gateway, run } = send(async () => "1000001", "dryRun");
    await run;
    expect(gateway.buildTrc20Transfer).toHaveBeenCalledOnce();
  });
});
