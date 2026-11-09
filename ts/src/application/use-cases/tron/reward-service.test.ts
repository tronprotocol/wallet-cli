import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRewardService } from "./reward-service.js";
import { sunAmount } from "../../../domain/amounts/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronAccountState, TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { TronTxPipelineParams, TxPipeline } from "../../services/pipeline/index.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const NET: NetworkDescriptor = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";

const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  deadline: new CommandDeadline(0),
  wait: false,

  emit: () => {},
  warn: () => {},
};

function accountState(latestWithdrawAt?: number): TronAccountState {
  return {
    balanceSun: "0",
    ...(latestWithdrawAt === undefined ? {} : { latestWithdrawAt }),
    stake: { energySun: "0", bandwidthSun: "0", tronPowerSun: "0", totalSun: "0" },
    unfreezing: [],
    votes: [],
    raw: {} as TronAccountState["raw"],
  };
}

function service(
  gateway: Partial<TronGateway>,
  pipeline?: Partial<TxPipeline>,
  now = 1_700_000_000_000,
) {
  const g = gateway as TronGateway;
  return new TronRewardService(
    { get: () => g } as unknown as ChainGatewayProvider,
    {
      assertCanSign: () => {},
      runTron: async () => ({ stage: "submitted", txId: "txid" }),
      ...pipeline,
    } as unknown as TxPipeline,
    () => now,
  );
}

describe("TronRewardService.balance", () => {
  it("returns claimable reward and available-now status for first withdrawal", async () => {
    const svc = service({
      getReward: async () => "123456789",
      getAccountState: async () => accountState(),
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
    const latest = now - 6 * 60 * 60 * 1000;
    const svc = service(
      {
        getReward: async () => "1",
        getAccountState: async () => accountState(latest),
      },
      undefined,
      now,
    );
    await expect(svc.balance(scope, NET)).resolves.toMatchObject({
      withdrawableNow: false,
      withdrawableAt: latest + 24 * 60 * 60 * 1000,
    });
  });
});

describe("TronRewardService.withdraw", () => {
  it("rejects when no reward is claimable", async () => {
    const svc = service({
      getReward: async () => "0",
      getAccountState: async () => accountState(),
    });
    await expect(svc.withdraw(scope, NET, {})).rejects.toMatchObject({
      code: "no_reward",
      kind: "execution",
    });
  });

  it.each(["", "-1", "1.5", "abc"])(
    "fails on a malformed claimable reward %j instead of reading it as none",
    async (reward) => {
      const svc = service({
        getReward: async () => reward,
        getAccountState: async () => accountState(),
      });
      await expect(svc.withdraw(scope, NET, {})).rejects.toMatchObject({
        code: "invalid_node_response",
      });
    },
  );

  it("rejects inside the 24h withdraw interval", async () => {
    const now = 1_700_000_000_000;
    const svc = service(
      {
        getReward: async () => "10",
        getAccountState: async () => accountState(now - 1_000),
      },
      undefined,
      now,
    );
    await expect(svc.withdraw(scope, NET, {})).rejects.toMatchObject({
      code: "withdraw_too_frequent",
      kind: "execution",
    });
  });

  it("echoes submitted rewardSun and confirmed withdrawnSun as rewardSun", async () => {
    const baseGateway = {
      getReward: async () => "10",
      getAccountState: async () => accountState(),
      buildWithdrawBalance: async () => ({}) as never,
    };
    const submitted = service(baseGateway).withdraw(scope, NET, {});
    await expect(submitted).resolves.toMatchObject({
      kind: "reward-withdraw",
      stage: "submitted",
      txId: "txid",
      rewardSun: "10",
      withdrawIntervalMs: 24 * 60 * 60 * 1000,
    });

    const confirmed = service(baseGateway, {
      runTron: async () => ({ stage: "confirmed", txId: "txid", withdrawnSun: sunAmount("12") }),
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

describe("TronRewardService.withdraw transaction hooks", () => {
  afterEach(() => vi.useRealTimers());

  it("check expiry and the signing window against the injected clock, not system time", async () => {
    const now = 1_800_000_000_500;
    const prepareTransaction = vi.fn((value) => value);
    const runTron = vi.fn(async () => ({ stage: "built", tx: {}, hex: "00" }));
    const svc = service(
      {
        getReward: async () => "1",
        getAccountState: async () => accountState(now - 25 * 60 * 60 * 1000),
        prepareTransaction,
      },
      { runTron } as unknown as Partial<TxPipeline>,
      now,
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now + 86_400_000);

    await svc.withdraw(scope, NET, { signOnly: true });

    const hooks = (runTron.mock.calls[0] as unknown as [TronTxPipelineParams])[0];
    const tx = {
      txID: "ab".repeat(32),
      raw_data_hex: "00",
      raw_data: { timestamp: now, expiration: now + 60_000, contract: [] },
    };
    expect(() => hooks.assertNotExpired(tx)).not.toThrow();
    await hooks.prepareForSigning(tx);
    expect(prepareTransaction).toHaveBeenCalledWith(tx, { permissionId: 0, expiration: 600_000 });
  });
});
