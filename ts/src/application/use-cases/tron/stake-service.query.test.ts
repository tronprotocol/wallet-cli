import { describe, it, expect } from "vitest";
import { TronStakeService } from "./stake-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = { id: "tron:nile", family: "tron", chainId: "nile", aliases: [], capabilities: [] } as NetworkDescriptor;
const OWNER = "TQkDWJimyBEhkFcqEfCWNbb6tMDwmH1234";

function svc(gateway: Record<string, unknown>) {
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  return new TronStakeService(gateways, {} as TxPipeline);
}
const scope = (addr: string) => ({ resolveAddress: () => addr }) as never;

describe("TronStakeService.info", () => {
  it("aggregates staked split, voting power, resources, unfreezing and slots", async () => {
    const gateway = {
      getAccount: async () => ({
        frozenV2: [{ type: "ENERGY", amount: "1000000000" }, { amount: "500000000" }],
        unfrozenV2: [
          { unfreeze_amount: "500000000", unfreeze_expire_time: 1784073600000 },
          { type: "ENERGY", unfreeze_amount: "300000000", unfreeze_expire_time: 1784160000000 },
        ],
      }),
      getAccountResources: async () => ({
        EnergyUsed: 12000, EnergyLimit: 65000, NetUsed: 100, NetLimit: 1000, freeNetUsed: 500, freeNetLimit: 500,
        tronPowerLimit: 1500, tronPowerUsed: 1000,
      }),
      getCanWithdrawUnfreezeAmount: async () => "0",
      getAvailableUnfreezeCount: async () => 30,
    };
    const view = await svc(gateway).info(scope(OWNER), net);
    expect(view).toEqual({
      address: OWNER,
      staked: { energySun: "1000000000", bandwidthSun: "500000000" },
      votingPower: { total: 1500, used: 1000, available: 500 },
      resource: { energy: { used: 12000, limit: 65000 }, bandwidth: { used: 600, limit: 1500 } },
      unfreezing: [
        { amountSun: "500000000", withdrawableAt: 1784073600000 },
        { amountSun: "300000000", withdrawableAt: 1784160000000 },
      ],
      withdrawableSun: "0",
      unfreeze: { used: 2, max: 32, remaining: 30 },
    });
  });
});

describe("TronStakeService.delegated", () => {
  const record = {
    from: OWNER, to: "TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub",
    balanceForEnergySun: "500000000", balanceForBandwidthSun: "0",
    expireTimeForEnergy: 1783468800000, expireTimeForBandwidth: null,
  };
  it("out: lists per-receiver rows with canDelegateMaxSun", async () => {
    const gateway = {
      getDelegatedIndexV2: async () => ({ fromAccounts: [], toAccounts: [record.to] }),
      getDelegatedResourceV2: async () => [record],
      getCanDelegatedMaxSize: async (_a: string, r: string) => (r === "ENERGY" ? "900000000" : "300000000"),
    };
    const view = await svc(gateway).delegated(scope(OWNER), net, { direction: "out" });
    expect(view).toEqual({
      address: OWNER,
      direction: "out",
      canDelegateMaxSun: { energy: "900000000", bandwidth: "300000000" },
      delegations: [{ receiver: record.to, resource: "energy", amountSun: "500000000", lockedUntil: 1783468800000 }],
    });
  });
  it("in: rows keyed by `from`, no canDelegateMaxSun, resource filter applies", async () => {
    const gateway = {
      getDelegatedIndexV2: async () => ({ fromAccounts: [record.from], toAccounts: [] }),
      getDelegatedResourceV2: async () => [{ ...record, balanceForBandwidthSun: "50000000" }],
    };
    const view = await svc(gateway).delegated(scope(record.to), net, { direction: "in", resource: "bandwidth" });
    expect(view).toEqual({
      address: record.to,
      direction: "in",
      delegations: [{ from: OWNER, resource: "bandwidth", amountSun: "50000000", lockedUntil: null }],
    });
  });
});

describe("TronStakeService.votingPower", () => {
  it("derives available from limit - used", async () => {
    const gateway = { getAccountResources: async () => ({ tronPowerLimit: 1500, tronPowerUsed: 1000 }) };
    expect(await svc(gateway).votingPower(net, OWNER)).toEqual({ total: 1500, used: 1000, available: 500 });
  });
});
