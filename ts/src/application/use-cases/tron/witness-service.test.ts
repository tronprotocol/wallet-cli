import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { TronWitnessService } from "./witness-service.js";

const NET: NetworkDescriptor = { id: "tron:nile", family: "tron", chainId: "nile", aliases: [], capabilities: [] };
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const scope: TransactionScope = {
  activeAccount: "wlt_test.0", resolveAddress: () => OWNER,
  timeoutMs: 60_000, wait: false, waitTimeoutMs: 60_000, emit: () => {}, warn: () => {},
};

function createService(gateway: Partial<TronGateway>) {
  const concrete = gateway as TronGateway;
  const pipeline = {
    assertCanSign: vi.fn(),
    run: async (params: TxPipelineParams) => {
      await params.build(OWNER);
      return { stage: "submitted", txId: "tx-witness", feeSun: 0 } as never;
    },
  } as unknown as TxPipeline;
  return new TronWitnessService(
    { get: () => concrete } as unknown as ChainGatewayProvider,
    pipeline,
  );
}

describe("TronWitnessService", () => {
  it("uses getAccountUpgradeCost exactly and reports the irreversible burn as feeSun", async () => {
    const build = vi.fn(async () => ({}));
    const service = createService({
      getWitness: async () => null,
      getAccount: async () => ({ balance: "10000000000" }),
      getChainParameters: async () => [{ key: "getAccountUpgradeCost", value: 9_999_000_000 }],
      buildWitnessCreate: build,
    });
    await expect(service.create(scope, NET, {
      url: "https://sr.example", permissionId: 2,
    })).resolves.toMatchObject({
      kind: "witness-create",
      feeSun: "9999000000",
      registrationFeeSun: "9999000000",
    });
    expect(build).toHaveBeenCalledWith(OWNER, "https://sr.example", { permissionId: 2 });
  });

  it("rejects insufficient registration balance before building", async () => {
    const build = vi.fn();
    const service = createService({
      getWitness: async () => null,
      getAccount: async () => ({ balance: "9998999999" }),
      getChainParameters: async () => [{ key: "getAccountUpgradeCost", value: 9_999_000_000 }],
      buildWitnessCreate: build,
    });
    await expect(service.create(scope, NET, { url: "https://sr.example", permissionId: 0 }))
      .rejects.toMatchObject({ code: "insufficient_balance" });
    expect(build).not.toHaveBeenCalled();
  });

  it("passes brokerage through unchanged: percent is the SR-retained share", async () => {
    const build = vi.fn(async () => ({}));
    const service = createService({
      getWitness: async () => ({ address: OWNER, voteCount: "1" }),
      buildWitnessSetBrokerage: build,
    });
    await expect(service.setBrokerage(scope, NET, { percent: 20, permissionId: 0 }))
      .resolves.toMatchObject({ brokerage: 20 });
    expect(build).toHaveBeenCalledWith(OWNER, 20, { permissionId: 0 });
  });
});
