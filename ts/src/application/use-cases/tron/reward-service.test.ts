import { describe, expect, it } from "vitest";
import { TronRewardService } from "./reward-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";

const NET: NetworkDescriptor = { id: "tron:nile", family: "tron", chainId: "nile", aliases: [], capabilities: [] };
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";

const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

function service(gateway: Partial<TronGateway>, pipeline?: Partial<TxPipeline>, now = 1_700_000_000_000) {
  const g = gateway as TronGateway;
  return new TronRewardService(
    { get: () => g } as unknown as ChainGatewayProvider,
    { assertCanSign: () => {}, run: async () => ({ stage: "submitted", txId: "txid" }), ...pipeline } as unknown as TxPipeline,
    () => now,
  );
}

describe("TronRewardService.balance", () => {
  it("returns claimable reward and available-now status for first withdrawal", async () => {
    const svc = service({
      getReward: async () => "123456789",
      getAccount: async () => ({}),
    });
    await expect(svc.balance(scope, NET)).resolves.toEqual({
      address: OWNER,
      rewardSun: "123456789",
      withdrawableNow: true,
      withdrawableAt: null,
    });
  });

  it("returns the next withdrawable timestamp inside the 24h interval", async () => {
    const now = 1_700_000_000_000;
    const latest = String(now - 6 * 60 * 60 * 1000);
    const svc = service({
      getReward: async () => "1",
      getAccount: async () => ({ latest_withdraw_time: latest }),
    }, undefined, now);
    await expect(svc.balance(scope, NET)).resolves.toMatchObject({
      withdrawableNow: false,
      withdrawableAt: Number(latest) + 24 * 60 * 60 * 1000,
    });
  });
});

describe("TronRewardService.withdraw", () => {
  it("rejects when no reward is claimable", async () => {
    const svc = service({
      getReward: async () => "0",
      getAccount: async () => ({}),
    });
    await expect(svc.withdraw(scope, NET, {})).rejects.toMatchObject({ code: "no_reward", kind: "execution" });
  });

  it("rejects inside the 24h withdraw interval", async () => {
    const now = 1_700_000_000_000;
    const svc = service({
      getReward: async () => "10",
      getAccount: async () => ({ latest_withdraw_time: String(now - 1_000) }),
    }, undefined, now);
    await expect(svc.withdraw(scope, NET, {})).rejects.toMatchObject({ code: "withdraw_too_frequent", kind: "execution" });
  });

  it("echoes submitted rewardSun and confirmed withdrawnSun as rewardSun", async () => {
    const baseGateway = {
      getReward: async () => "10",
      getAccount: async () => ({}),
      buildWithdrawBalance: async () => ({}),
    };
    const submitted = service(baseGateway).withdraw(scope, NET, {});
    await expect(submitted).resolves.toMatchObject({
      kind: "reward-withdraw",
      stage: "submitted",
      txId: "txid",
      rewardSun: "10",
    });

    const confirmed = service(baseGateway, {
      run: async () => ({ stage: "confirmed", txId: "txid", withdrawnSun: "12" }),
    }).withdraw(scope, NET, {});
    await expect(confirmed).resolves.toMatchObject({
      kind: "reward-withdraw",
      stage: "confirmed",
      txId: "txid",
      withdrawnSun: "12",
      rewardSun: "12",
    });
  });
});
