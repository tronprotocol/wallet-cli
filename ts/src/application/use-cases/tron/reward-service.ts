import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronAccount } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData, transactionMode, type TransactionModeInput } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";

const WITHDRAW_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class TronRewardService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async balance(scope: Pick<TransactionScope, "resolveAddress">, network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "tron");
    const address = scope.resolveAddress("tron");
    const [rewardSun, account] = await Promise.all([
      gateway.getReward(address),
      gateway.getAccount(address),
    ]);
    return {
      address,
      rewardSun,
      ...withdrawStatus(account, this.now()),
    };
  }

  async withdraw(scope: TransactionScope, network: NetworkDescriptor, input: TransactionModeInput) {
    const gateway = this.gateways.get(network, "tron");
    const address = scope.resolveAddress("tron");
    const [rewardSun, account] = await Promise.all([
      gateway.getReward(address),
      gateway.getAccount(address),
    ]);
    if (toUnsignedBigInt(rewardSun) === 0n) {
      throw new UsageError("no_reward", "no voting/block reward is currently claimable");
    }
    const status = withdrawStatus(account, this.now());
    if (!status.withdrawableNow) {
      throw new UsageError("withdraw_too_frequent", `reward can be withdrawn after ${new Date(status.withdrawableAt!).toISOString()}`);
    }
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      confirm: tronConfirmation(gateway, scope),
      build: (owner) => gateway.buildWithdrawBalance(owner),
      estimate: async () => ({ feeModel: "tron-resource", note: "reward withdrawal uses bandwidth only" }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "reward-withdraw" as const,
      ...data,
      rewardSun: String(data.withdrawnSun ?? rewardSun),
    };
  }
}

function withdrawStatus(account: TronAccount, now: number): { withdrawableNow: boolean; withdrawableAt: number | null } {
  const latest = toUnsignedBigInt(account.latest_withdraw_time);
  if (latest === 0n) return { withdrawableNow: true, withdrawableAt: null };
  const at = Number(latest) + WITHDRAW_INTERVAL_MS;
  return at <= now
    ? { withdrawableNow: true, withdrawableAt: null }
    : { withdrawableNow: false, withdrawableAt: at };
}

function toUnsignedBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value >= 0n ? value : 0n;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : 0n;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}
