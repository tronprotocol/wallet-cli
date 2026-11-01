import { CommandDeadline } from "../../services/command-deadline.js";
import { describe, it, expect } from "vitest";
import { TronStakeService } from "./stake-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NO_DEADLINE = new CommandDeadline(0);

const net = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  aliases: [],
  capabilities: [],
} as NetworkDescriptor;
const OWNER = "TQkDWJimyBEhkFcqEfCWNbb6tMDwmH1234";

function svc(gateway: Record<string, unknown>) {
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  return new TronStakeService(gateways, {} as TxPipeline);
}
const scope = (addr: string) => ({ deadline: NO_DEADLINE, resolveAddress: () => addr }) as never;

describe("TronStakeService.info", () => {
  it("passes through the adapter's stake totals, unfreezing entries and resources", async () => {
    const stake = {
      energySun: "1000000000",
      bandwidthSun: "500000000",
      tronPowerSun: "0",
      totalSun: "1500000000",
    };
    const unfreezing = [
      { amountSun: "500000000", withdrawableAt: 1784073600000 },
      { amountSun: "300000000", withdrawableAt: 1784160000000 },
    ];
    const gateway = {
      getAccountState: async () => ({ stake, unfreezing }),
      getAccountResources: async () => ({
        energy: { used: 12000, limit: 65000 },
        bandwidth: { used: 600, limit: 1500 },
        votingPower: { total: 1500, used: 1000 },
      }),
      getCanWithdrawUnfreezeAmount: async () => "0",
      getAvailableUnfreezeCount: async () => 30,
    };
    const view = await svc(gateway).info(scope(OWNER), net);
    expect(view).toEqual({
      address: OWNER,
      staked: stake,
      votingPower: { total: 1500, used: 1000, available: 500 },
      resource: { energy: { used: 12000, limit: 65000 }, bandwidth: { used: 600, limit: 1500 } },
      unfreezing,
      withdrawableSun: "0",
      unfreeze: { used: 2, max: 32, remaining: 30 },
    });
  });
});

describe("TronStakeService.delegated", () => {
  const record = {
    from: OWNER,
    to: "TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub",
    balanceForEnergySun: "500000000",
    balanceForBandwidthSun: "0",
    expireTimeForEnergy: 1783468800000,
    expireTimeForBandwidth: null,
  };
  it("out: lists per-receiver rows with canDelegateMaxSun", async () => {
    const gateway = {
      getDelegatedIndexV2: async () => ({ fromAccounts: [], toAccounts: [record.to] }),
      getDelegatedResourceV2: async () => [record],
      getCanDelegatedMaxSize: async (_a: string, r: string) =>
        r === "ENERGY" ? "900000000" : "300000000",
    };
    const view = await svc(gateway).delegated(scope(OWNER), net, { direction: "out" });
    expect(view).toEqual({
      address: OWNER,
      direction: "out",
      canDelegateMaxSun: { energy: "900000000", bandwidth: "300000000" },
      delegations: [
        {
          receiver: record.to,
          resource: "energy",
          amountSun: "500000000",
          lockedUntil: 1783468800000,
        },
      ],
    });
  });
  it("in: rows keyed by `from`, no canDelegateMaxSun, resource filter applies", async () => {
    const gateway = {
      getDelegatedIndexV2: async () => ({ fromAccounts: [record.from], toAccounts: [] }),
      getDelegatedResourceV2: async () => [{ ...record, balanceForBandwidthSun: "50000000" }],
    };
    const view = await svc(gateway).delegated(scope(record.to), net, {
      direction: "in",
      resource: "bandwidth",
    });
    expect(view).toEqual({
      address: record.to,
      direction: "in",
      delegations: [
        { from: OWNER, resource: "bandwidth", amountSun: "50000000", lockedUntil: null },
      ],
    });
  });
});

describe("TronStakeService.votingPower", () => {
  it("derives available from limit - used", async () => {
    const gateway = {
      getAccountResources: async () => ({ votingPower: { total: 1500, used: 1000 } }),
    };
    expect(await svc(gateway).votingPower(NO_DEADLINE, net, OWNER)).toEqual({
      total: 1500,
      used: 1000,
      available: 500,
    });
  });
});
