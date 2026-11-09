import { describe, it, expect, vi } from "vitest";
import { TronStakeService } from "./stake-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { CommandDeadline } from "../../services/command-deadline.js";

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
const scope = { deadline: NO_DEADLINE, activeAccount: {}, resolveAddress: () => OWNER } as never;

function stubPipeline() {
  return {
    assertCanSign: () => {},
    runTron: async (p: { build: (owner: string) => Promise<unknown> }) => {
      await p.build(OWNER);
      return { stage: "submitted", txId: "0xdeadbeef" };
    },
  } as unknown as TxPipeline;
}

function staked(stake: Partial<Record<"energySun" | "bandwidthSun" | "tronPowerSun", string>>) {
  return { stake: { energySun: "0", bandwidthSun: "0", tronPowerSun: "0", ...stake } };
}

function svc(gateway: Record<string, unknown>) {
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  return new TronStakeService(gateways, stubPipeline());
}

describe("TronStakeService.unfreeze pre-flight", () => {
  it("rejects when the requested amount exceeds the staked amount for that resource", async () => {
    const buildUnfreezeV2 = vi.fn();
    const gateway = {
      getAccountState: async () => staked({ energySun: "1000000" }),
      buildUnfreezeV2,
    };

    await expect(
      svc(gateway).unfreeze(scope, net, { amountSun: "2000000", resource: "energy" }),
    ).rejects.toMatchObject({ code: "insufficient_stake" });
    expect(buildUnfreezeV2).not.toHaveBeenCalled();
  });

  it("checks bandwidth stake against the bandwidth total", async () => {
    const buildUnfreezeV2 = vi.fn(async () => ({ txID: "tx" }));
    const gateway = {
      getAccountState: async () => staked({ bandwidthSun: "5000000" }),
      buildUnfreezeV2,
    };

    await svc(gateway).unfreeze(scope, net, { amountSun: "5000000", resource: "bandwidth" });
    expect(buildUnfreezeV2).toHaveBeenCalledWith(OWNER, "5000000", "BANDWIDTH");
  });

  it("does not count the other resource's stake toward the requested one", async () => {
    const buildUnfreezeV2 = vi.fn();
    const gateway = {
      getAccountState: async () => staked({ energySun: "9000000", tronPowerSun: "9000000" }),
      buildUnfreezeV2,
    };

    await expect(
      svc(gateway).unfreeze(scope, net, { amountSun: "1", resource: "bandwidth" }),
    ).rejects.toMatchObject({ code: "insufficient_stake" });
    expect(buildUnfreezeV2).not.toHaveBeenCalled();
  });

  it("proceeds when the requested amount equals the staked amount", async () => {
    const buildUnfreezeV2 = vi.fn(async () => ({ txID: "tx" }));
    const gateway = {
      getAccountState: async () => staked({ energySun: "1000000" }),
      buildUnfreezeV2,
    };

    const result = await svc(gateway).unfreeze(scope, net, {
      amountSun: "1000000",
      resource: "energy",
    });
    expect(buildUnfreezeV2).toHaveBeenCalledWith(OWNER, "1000000", "ENERGY");
    expect(result).toMatchObject({ kind: "stake-unfreeze", txId: "0xdeadbeef" });
  });
});

describe("TronStakeService.freeze pre-flight", () => {
  it("rejects when the requested stake exceeds the spendable balance", async () => {
    const buildFreezeV2 = vi.fn();
    const gateway = {
      getNativeBalance: async () => "1000000",
      buildFreezeV2,
    };

    await expect(
      svc(gateway).freeze(scope, net, { amountSun: "2000000", resource: "energy" }),
    ).rejects.toMatchObject({ code: "insufficient_balance" });
    expect(buildFreezeV2).not.toHaveBeenCalled();
  });

  it("proceeds when the requested stake is within the balance", async () => {
    const buildFreezeV2 = vi.fn(async () => ({ txID: "tx" }));
    const gateway = {
      getNativeBalance: async () => "2000000",
      buildFreezeV2,
    };

    const result = await svc(gateway).freeze(scope, net, {
      amountSun: "2000000",
      resource: "energy",
    });
    expect(buildFreezeV2).toHaveBeenCalledWith(OWNER, "2000000", "ENERGY");
    expect(result).toMatchObject({ kind: "stake-freeze", txId: "0xdeadbeef" });
  });
});

describe("TronStakeService.undelegate pre-flight", () => {
  const RECEIVER = "TML5f7kUCYNYk8xiVPbHrVbJEbL2cnFf4e";
  const delegation = (energySun: string, bandwidthSun = "0") => [
    {
      from: OWNER,
      to: RECEIVER,
      balanceForEnergySun: energySun,
      balanceForBandwidthSun: bandwidthSun,
      expireTimeForEnergy: null,
      expireTimeForBandwidth: null,
    },
  ];

  it("rejects an amount above what is delegated to the receiver for that resource", async () => {
    const buildUndelegateResource = vi.fn();
    const getDelegatedResourceV2 = vi.fn(async () => delegation("1000000", "9000000"));
    await expect(
      svc({ getDelegatedResourceV2, buildUndelegateResource }).undelegate(scope, net, {
        amountSun: "1000001",
        resource: "energy",
        receiver: RECEIVER,
      }),
    ).rejects.toMatchObject({ code: "insufficient_stake" });
    expect(getDelegatedResourceV2).toHaveBeenCalledWith(OWNER, RECEIVER);
    expect(buildUndelegateResource).not.toHaveBeenCalled();
  });

  it("rejects when nothing is delegated to the receiver", async () => {
    const buildUndelegateResource = vi.fn();
    await expect(
      svc({ getDelegatedResourceV2: async () => [], buildUndelegateResource }).undelegate(
        scope,
        net,
        { amountSun: "1", resource: "bandwidth", receiver: RECEIVER },
      ),
    ).rejects.toMatchObject({ code: "insufficient_stake" });
    expect(buildUndelegateResource).not.toHaveBeenCalled();
  });

  it("proceeds when the amount equals the delegation", async () => {
    const buildUndelegateResource = vi.fn(async () => ({ txID: "tx" }));
    await svc({
      getDelegatedResourceV2: async () => delegation("0", "2000000"),
      buildUndelegateResource,
    }).undelegate(scope, net, { amountSun: "2000000", resource: "bandwidth", receiver: RECEIVER });
    expect(buildUndelegateResource).toHaveBeenCalledWith(OWNER, "2000000", "BANDWIDTH", RECEIVER);
  });
});
