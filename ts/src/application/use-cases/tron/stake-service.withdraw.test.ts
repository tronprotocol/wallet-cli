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

// A pipeline stub that exercises the build callback (where the pre-flight guard lives) exactly as
// the real pipeline does: build → return a submitted receipt.
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

describe("TronStakeService.withdraw pre-flight", () => {
  it("rejects with nothing_to_withdraw when there is no expired unfrozen TRX", async () => {
    const buildWithdrawExpireUnfreeze = vi.fn();
    const gateway = {
      getCanWithdrawUnfreezeAmount: async () => "0",
      buildWithdrawExpireUnfreeze,
    };
    await expect(svc(gateway).withdraw(scope, net, {})).rejects.toMatchObject({
      code: "nothing_to_withdraw",
    });
    // never builds/broadcasts a doomed tx → no phantom txid.
    expect(buildWithdrawExpireUnfreeze).not.toHaveBeenCalled();
  });

  it("proceeds to build the withdraw tx when there is a withdrawable amount", async () => {
    const buildWithdrawExpireUnfreeze = vi.fn(async () => ({ txID: "tx" }));
    const gateway = {
      getCanWithdrawUnfreezeAmount: async () => "1000000",
      buildWithdrawExpireUnfreeze,
    };
    const result = await svc(gateway).withdraw(scope, net, {});
    expect(buildWithdrawExpireUnfreeze).toHaveBeenCalledWith(OWNER);
    expect(result).toMatchObject({ kind: "stake-withdraw", txId: "0xdeadbeef" });
  });
});
