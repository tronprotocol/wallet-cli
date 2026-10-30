import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline, TronTxPipelineParams } from "../../services/pipeline/index.js";
import { TronContractService } from "./contract-service.js";
import { sunAmount } from "../../../domain/amounts/index.js";

const NET: NetworkDescriptor = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OTHER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

function createService(gateway: Partial<TronGateway>) {
  const concrete = gateway as TronGateway;
  const captured: TronTxPipelineParams[] = [];
  const pipeline = {
    assertCanSign: vi.fn(),
    runTron: async (params: TronTxPipelineParams) => {
      captured.push(params);
      await params.build(OWNER);
      return { stage: "submitted", txId: "tx-contract" } as never;
    },
  } as unknown as TxPipeline;
  return {
    service: new TronContractService(
      { get: () => concrete } as unknown as ChainGatewayProvider,
      pipeline,
    ),
    captured,
  };
}

describe("TronContractService governance", () => {
  it("applies permission and expiration controls to contract send", async () => {
    const trigger = vi.fn(async () => ({ raw_data: {} }) as never);
    const { service, captured } = createService({
      triggerSmartContract: trigger,
      estimateResources: async () => ({ feeModel: "tron-resource", energy: 0 }),
    });
    await expect(
      service.send(scope, NET, {
        contract: CONTRACT,
        method: "set(uint256)",
        parameters: [{ type: "uint256", value: "1" }],
        callValueSun: sunAmount("0"),
        feeLimit: sunAmount("100000000"),
        permissionId: 2,
        expiration: 120_000,
        signOnly: true,
      }),
    ).resolves.toMatchObject({ kind: "contract-send", txId: "tx-contract" });
    expect(trigger).toHaveBeenCalledWith(
      OWNER,
      CONTRACT,
      "set(uint256)",
      [{ type: "uint256", value: "1" }],
      { feeLimit: "100000000", callValue: "0", permissionId: 2 },
    );
    expect(captured[0]).toMatchObject({ permissionId: 2, expiration: 120_000 });
    expect(typeof captured[0]!.prepare).toBe("function");
  });

  it("requires SmartContract.origin_address to equal the selected account", async () => {
    const build = vi.fn();
    const { service } = createService({
      getContractMetadata: async () => ({
        methods: [],
        originAddress: OTHER,
        contract: {} as never,
      }),
      buildClearContractAbi: build,
    });
    await expect(
      service.clearAbi(scope, NET, { address: CONTRACT, permissionId: 0 }),
    ).rejects.toMatchObject({ code: "not_contract_deployer" });
    expect(build).not.toHaveBeenCalled();
  });

  it("maps the generic adapter absence to contract_not_found", async () => {
    const { service } = createService({
      getContractMetadata: async () => {
        throw new ChainError("not_found", "missing");
      },
    });
    await expect(
      service.clearAbi(scope, NET, { address: CONTRACT, permissionId: 0 }),
    ).rejects.toMatchObject({ code: "contract_not_found" });
  });

  it("refuses a user resource percent above 100 before building", async () => {
    const build = vi.fn();
    const { service } = createService({ buildUpdateUserResourcePercent: build });
    await expect(
      service.setUserResourcePercent(scope, NET, { address: CONTRACT, percent: 101 }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    expect(build).not.toHaveBeenCalled();
  });

  it("passes the caller-paid percentage through without reversing it", async () => {
    const build = vi.fn(async () => ({}) as never);
    const { service } = createService({
      getContractMetadata: async () => ({
        methods: [],
        originAddress: OWNER,
        contract: {} as never,
      }),
      buildUpdateUserResourcePercent: build,
    });
    await expect(
      service.setUserResourcePercent(scope, NET, {
        address: CONTRACT,
        percent: 100,
        permissionId: 2,
      }),
    ).resolves.toMatchObject({
      contractAddress: CONTRACT,
      deployerAddress: OWNER,
      consumeUserResourcePercent: 100,
    });
    expect(build).toHaveBeenCalledWith(OWNER, CONTRACT, 100, { permissionId: 2 });
  });

  it("accepts an energy limit above TronWeb's obsolete 10M client cap", async () => {
    const build = vi.fn(async () => ({}) as never);
    const { service } = createService({
      getContractMetadata: async () => ({
        methods: [],
        originAddress: OWNER,
        contract: {} as never,
      }),
      buildUpdateOriginEnergyLimit: build,
    });
    await expect(
      service.setOriginEnergyLimit(scope, NET, {
        address: CONTRACT,
        energy: 50_000_000,
        permissionId: 0,
      }),
    ).resolves.toMatchObject({ originEnergyLimit: 50_000_000 });
    expect(build).toHaveBeenCalledWith(OWNER, CONTRACT, 50_000_000, { permissionId: 0 });
  });
});
