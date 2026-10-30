import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { decimalToBigInt } from "../../../domain/numbers/index.js";
import {
  REWARD_WITHDRAW_INTERVAL_MS,
  rewardWithdrawStatus,
} from "../../../domain/governance/voting.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  receiptOf,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

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
      gateway.getAccountState(address),
    ]);
    return {
      address,
      rewardSun,
      ...rewardWithdrawStatus(account.latestWithdrawAt, this.now()),
    };
  }

  async withdraw(scope: TransactionScope, network: NetworkDescriptor, input: TransactionModeInput) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron");
    const address = scope.resolveAddress("tron");
    const [rewardSun, account] = await Promise.all([
      gateway.getReward(address),
      gateway.getAccountState(address),
    ]);
    if (
      decimalToBigInt(
        rewardSun,
        "claimable reward",
        (message) => new ChainError("invalid_node_response", message),
      ) === 0n
    ) {
      throw new ChainError("no_reward", "no voting/block reward is currently claimable");
    }
    const status = rewardWithdrawStatus(account.latestWithdrawAt, this.now());
    if (!status.withdrawableNow) {
      throw new ChainError(
        "withdraw_too_frequent",
        `reward can be withdrawn after ${new Date(status.withdrawableAt!).toISOString()}`,
      );
    }
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (owner) => gateway.buildWithdrawBalance(owner),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "reward withdrawal uses bandwidth only",
      }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "reward-withdraw" as const,
      ...data,
      rewardSun: String(receiptOf(data).withdrawnSun ?? rewardSun),
      withdrawIntervalMs: REWARD_WITHDRAW_INTERVAL_MS,
    };
  }
}
