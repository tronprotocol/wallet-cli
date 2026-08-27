import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { TronContractService } from "./contract-service.js";

const NETWORK = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
} as unknown as NetworkDescriptor;

describe("TronContractService.send fee-limit guidance", () => {
  it("keeps dry-run successful but warns when fee-limit is clearly below the estimate", async () => {
    const warn = vi.fn();
    const scope = {
      activeAccount: {} as never,
      wait: false,
      waitTimeoutMs: 1_000,
      resolveAddress: () => "Towner",
      warn,
    } as unknown as TransactionScope;
    const gateway = {
      triggerSmartContract: vi.fn(async () => ({ txID: "plan" })),
      estimateResources: vi.fn(async () => ({
        feeModel: "tron-resource" as const,
        energy: 6_278,
        availableEnergy: 0,
        energyPriceSun: "0:100,1754644200000:100",
      })),
    } as unknown as TronGateway;
    const pipeline = {
      async run(params: { estimate: (tx: unknown) => Promise<Record<string, unknown>> }) {
        const fee = await params.estimate({});
        return { stage: "plan", tx: { txID: "plan" }, fee };
      },
    } as unknown as TxPipeline;
    const service = new TronContractService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      pipeline,
    );

    const result = await service.send(scope, NETWORK, {
      contract: "Tcontract",
      method: "transfer(address,uint256)",
      parameters: [],
      callValueSun: "0",
      feeLimit: "1",
      dryRun: true,
    });

    expect((result as { mode?: string }).mode).toBe("dry-run");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("fee limit 1 SUN is likely insufficient"),
    );
  });
});
