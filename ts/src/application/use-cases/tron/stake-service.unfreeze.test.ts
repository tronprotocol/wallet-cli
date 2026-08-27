import { describe, it, expect, vi } from "vitest";
import { TronStakeService } from "./stake-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  aliases: [],
  capabilities: [],
} as NetworkDescriptor;
const OWNER = "TQkDWJimyBEhkFcqEfCWNbb6tMDwmH1234";
const scope = { activeAccount: {}, resolveAddress: () => OWNER } as never;

// Mirrors the real pipeline's ordering: build runs before the dry-run early return, so a guard
// placed in the build callback covers --dry-run too.
function stubPipeline() {
  return {
    assertCanSign: () => {},
    run: async (p: { build: (owner: string) => Promise<unknown> }) => {
      await p.build(OWNER);
      return { stage: "submitted", txId: "0xdeadbeef" };
    },
  } as unknown as TxPipeline;
}

function svc(gateway: Record<string, unknown>) {
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  return new TronStakeService(gateways, stubPipeline());
}

describe("TronStakeService.unfreeze pre-flight", () => {
  it("rejects when the requested amount exceeds the staked amount for that resource", async () => {
    const buildUnfreezeV2 = vi.fn();
    const gateway = {
      getAccount: async () => ({ frozenV2: [{ type: "ENERGY", amount: "1000000" }] }),
      buildUnfreezeV2,
    };

    await expect(
      svc(gateway).unfreeze(scope, net, { amountSun: "2000000", resource: "energy" }),
    ).rejects.toMatchObject({ code: "insufficient_stake" });
    expect(buildUnfreezeV2).not.toHaveBeenCalled();
  });

  // frozenV2 omits `type` for BANDWIDTH (default enum), so a naive filter would read the
  // bandwidth stake as zero and reject every legitimate bandwidth unstake.
  it("counts the untyped frozenV2 entry as bandwidth stake", async () => {
    const buildUnfreezeV2 = vi.fn(async () => ({ txID: "tx" }));
    const gateway = {
      getAccount: async () => ({ frozenV2: [{ amount: "5000000" }] }),
      buildUnfreezeV2,
    };

    await svc(gateway).unfreeze(scope, net, { amountSun: "5000000", resource: "bandwidth" });
    expect(buildUnfreezeV2).toHaveBeenCalledWith(OWNER, "5000000", "BANDWIDTH");
  });

  it("does not count the other resource's stake toward the requested one", async () => {
    const buildUnfreezeV2 = vi.fn();
    const gateway = {
      getAccount: async () => ({ frozenV2: [{ type: "ENERGY", amount: "9000000" }] }),
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
      getAccount: async () => ({ frozenV2: [{ type: "ENERGY", amount: "1000000" }] }),
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
