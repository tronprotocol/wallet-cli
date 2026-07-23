import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { TronTransactionService } from "./transaction-service.js";

const OWNER = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const RECEIVER = "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT";
const NETWORK = {
  id: "tron:nile",
  family: "tron",
  chainId: "nile",
  aliases: ["nile"],
  capabilities: [],
} satisfies NetworkDescriptor;

function scope(): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => OWNER,
    timeoutMs: 100,
    wait: false,
    waitTimeoutMs: 100,
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
      run: vi.fn(async (params: TxPipelineParams) => {
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
      feeLimit: "100000000",
      dryRun: true,
    });

    expect(recipients.resolve).toHaveBeenCalledWith("tron", "alice");
    expect(gateway.buildNativeTransfer).toHaveBeenCalledWith(
      OWNER,
      RECEIVER,
      "1000000",
    );
    expect(result).toMatchObject({
      kind: "send",
      mode: "dry-run",
      to: RECEIVER,
      toContact: "Alice",
    });
    expect(pipeline.assertCanSign).not.toHaveBeenCalled();
  });
});
