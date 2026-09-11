import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { TronContractService } from "./contract-service.js";

const NETWORK = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
} as NetworkDescriptor;
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const OPERATOR = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const scope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: vi.fn(),
  warn: vi.fn(),
} as TransactionScope;

describe("TronContractService.send — approve", () => {
  it("reports ERC-721 approval semantics without querying TRC-20 metadata", async () => {
    const getTokenInfo = vi.fn(async () => ({ decimals: 6, symbol: "USDT" }));
    const gateway = {
      getTokenInfo,
      triggerSmartContract: vi.fn(async () => ({ txID: "plan" })),
      estimateResources: vi.fn(async () => ({ feeModel: "tron-resource", energy: 1 })),
    } as unknown as TronGateway;
    const pipeline = {
      run: vi.fn(async (params: TxPipelineParams) => ({
        stage: "plan" as const,
        tx: await params.build(OWNER),
        fee: {},
      })),
    } as unknown as TxPipeline;
    const service = new TronContractService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      pipeline,
    );

    await expect(
      service.send(scope, NETWORK, {
        contract: CONTRACT,
        method: "approve(address,uint256)",
        parameters: [
          { type: "address", value: OPERATOR },
          { type: "uint256", value: "42" },
        ],
        callValueSun: "0",
        feeLimit: "100000000",
        dryRun: true,
        approvalKind: "erc721",
      }),
    ).resolves.toMatchObject({ identity: { operator: OPERATOR, agentId: "42" } });
    expect(getTokenInfo).not.toHaveBeenCalled();
  });
});
