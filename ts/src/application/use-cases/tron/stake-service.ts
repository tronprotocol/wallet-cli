import { requestDispatchCheck } from "../../services/command-deadline.js";
import { systemWallClock, type WallClock } from "../../contracts/wall-clock.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type {
  NetworkDescriptor,
  TronTransactionArtifact,
  TxReceiptKind,
} from "../../../domain/types/index.js";
import { ChainError, errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import {
  MAX_UNFREEZING_ENTRIES,
  toRpcCode,
  type Resource,
} from "../../../domain/tron/resources/index.js";
import type { AccountScope, TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronStakeTotals } from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";
import { readVotingPower, votingPowerView, type VotingPowerView } from "./voting-power.js";

export interface StakeAmountInput extends TransactionModeInput {
  amountSun: string;
  resource: Resource;
}

export interface StakeDelegateInput extends StakeAmountInput {
  receiver: string;
  lock?: boolean;
  lockPeriod?: string;
}

export interface StakeInfoView {
  address: string;
  staked: TronStakeTotals;
  votingPower: VotingPowerView;
  resource: {
    energy: { used: number; limit: number };
    bandwidth: { used: number; limit: number };
  };
  unfreezing: Array<{ amountSun: string; withdrawableAt: number }>;
  withdrawableSun: string;
  unfreeze: { used: number; max: number; remaining: number };
}

export interface StakeDelegatedView {
  address: string;
  direction: "out" | "in";
  // Only the selected resource's cap when the query names one.
  canDelegateMaxSun?: Partial<Record<Resource, string>>;
  delegations: Array<{
    receiver?: string;
    from?: string;
    resource: Resource;
    amountSun: string;
    lockedUntil: number | null;
  }>;
}

export class TronStakeService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
    private readonly now: WallClock = systemWallClock,
  ) {}

  async votingPower(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    address: string,
  ): Promise<VotingPowerView> {
    return readVotingPower(
      this.gateways.get(network, "tron", requestDispatchCheck(deadline)),
      address,
    );
  }

  async info(scope: AccountScope, network: NetworkDescriptor): Promise<StakeInfoView> {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const [account, resources, withdrawableSun, remaining] = await Promise.all([
      gateway.getAccountState(address),
      gateway.getAccountResources(address),
      gateway.getCanWithdrawUnfreezeAmount(address),
      gateway.getAvailableUnfreezeCount(address),
    ]);
    return {
      address,
      staked: account.stake,
      votingPower: votingPowerView(resources),
      resource: { energy: resources.energy, bandwidth: resources.bandwidth },
      unfreezing: account.unfreezing,
      withdrawableSun,
      unfreeze: { used: account.unfreezing.length, max: MAX_UNFREEZING_ENTRIES, remaining },
    };
  }

  async delegated(
    scope: AccountScope,
    network: NetworkDescriptor,
    input: { direction: "out" | "in"; resource?: Resource; to?: string },
  ): Promise<StakeDelegatedView> {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const index = await gateway.getDelegatedIndexV2(address);
    const out = input.direction === "out";
    const counterparties = out ? (input.to ? [input.to] : index.toAccounts) : index.fromAccounts;
    const records = (
      await Promise.all(
        counterparties.map((cp) =>
          gateway.getDelegatedResourceV2(out ? address : cp, out ? cp : address),
        ),
      )
    ).flat();
    // Each delegation record carries both energy and bandwidth balances.
    const rows = records.flatMap((rec) => {
      const counterparty = out ? rec.to : rec.from;
      const key = out ? "receiver" : "from";
      const both = [
        {
          resource: "energy" as const,
          amountSun: rec.balanceForEnergySun,
          lockedUntil: rec.expireTimeForEnergy,
        },
        {
          resource: "bandwidth" as const,
          amountSun: rec.balanceForBandwidthSun,
          lockedUntil: rec.expireTimeForBandwidth,
        },
      ];
      return both
        .filter((b) => b.amountSun !== "0" && (!input.resource || b.resource === input.resource))
        .map((b) => ({ [key]: counterparty, ...b }));
    });
    if (!out) return { address, direction: input.direction, delegations: rows };
    const resources = input.resource ? [input.resource] : (["energy", "bandwidth"] as const);
    const caps = await Promise.all(
      resources.map(
        async (resource) =>
          [resource, await gateway.getCanDelegatedMaxSize(address, toRpcCode(resource))] as const,
      ),
    );
    return {
      address,
      direction: input.direction,
      canDelegateMaxSun: Object.fromEntries(caps),
      delegations: rows,
    };
  }

  freeze(scope: TransactionScope, network: NetworkDescriptor, input: StakeAmountInput) {
    return this.transact("stake-freeze", scope, network, input, async (gateway, owner) => {
      // Check funds during build so dry runs detect insufficient balance too.
      const balance = BigInt(await gateway.getNativeBalance(owner));
      if (BigInt(input.amountSun) > balance) {
        throw new ChainError(
          "insufficient_balance",
          `cannot stake ${input.amountSun} SUN: balance is ${balance} SUN`,
        );
      }
      return gateway.buildFreezeV2(owner, input.amountSun, toRpcCode(input.resource));
    });
  }

  unfreeze(scope: TransactionScope, network: NetworkDescriptor, input: StakeAmountInput) {
    return this.transact("stake-unfreeze", scope, network, input, async (gateway, owner) => {
      // Check stake during build so dry runs detect insufficient stake too.
      const { stake } = await gateway.getAccountState(owner);
      const staked = BigInt(input.resource === "energy" ? stake.energySun : stake.bandwidthSun);
      if (BigInt(input.amountSun) > staked) {
        throw new ChainError(
          "insufficient_stake",
          `cannot unstake ${input.amountSun} SUN: only ${staked} SUN is staked for ${input.resource}`,
        );
      }
      return gateway.buildUnfreezeV2(owner, input.amountSun, toRpcCode(input.resource));
    });
  }

  withdraw(scope: TransactionScope, network: NetworkDescriptor, input: TransactionModeInput) {
    return this.transact("stake-withdraw", scope, network, input, async (gateway, owner) => {
      // Empty withdrawals can be accepted without confirming; reject before broadcast.
      if (BigInt(await gateway.getCanWithdrawUnfreezeAmount(owner)) <= 0n) {
        throw new ChainError(
          "nothing_to_withdraw",
          "no expired unfrozen TRX available to withdraw",
        );
      }
      return gateway.buildWithdrawExpireUnfreeze(owner);
    });
  }

  cancelUnfreeze(scope: TransactionScope, network: NetworkDescriptor, input: TransactionModeInput) {
    // Ledger cannot sign CancelAllUnfreezeV2; reject before device I/O.
    return this.transact(
      "stake-cancel",
      scope,
      network,
      input,
      (gateway, owner) => gateway.buildCancelAllUnfreezeV2(owner),
      { requireSoftware: true },
    );
  }

  delegate(scope: TransactionScope, network: NetworkDescriptor, input: StakeDelegateInput) {
    return this.transact("stake-delegate", scope, network, input, (gateway, owner) => {
      this.assertDifferentReceiver(owner, input.receiver);
      return gateway.buildDelegateResource(
        owner,
        input.amountSun,
        toRpcCode(input.resource),
        input.receiver,
        input.lock ?? false,
        input.lockPeriod,
      );
    });
  }

  undelegate(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: Omit<StakeDelegateInput, "lock" | "lockPeriod">,
  ) {
    return this.transact("stake-undelegate", scope, network, input, async (gateway, owner) => {
      this.assertDifferentReceiver(owner, input.receiver);
      // Check the delegation during build so dry runs detect an amount above it too.
      const records = await gateway.getDelegatedResourceV2(owner, input.receiver);
      const delegated = records.reduce(
        (sum, rec) =>
          sum +
          BigInt(
            input.resource === "energy" ? rec.balanceForEnergySun : rec.balanceForBandwidthSun,
          ),
        0n,
      );
      if (BigInt(input.amountSun) > delegated) {
        throw new ChainError(
          "insufficient_stake",
          `cannot reclaim ${input.amountSun} SUN: only ${delegated} SUN of ${input.resource} is delegated to ${input.receiver}`,
        );
      }
      return gateway.buildUndelegateResource(
        owner,
        input.amountSun,
        toRpcCode(input.resource),
        input.receiver,
      );
    });
  }

  private async transact(
    kind: TxReceiptKind,
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionModeInput & Partial<StakeAmountInput & StakeDelegateInput>,
    build: (gateway: TronGateway, owner: string) => Promise<TronTransactionArtifact>,
    opts?: { requireSoftware?: boolean },
  ) {
    if (transactionRequiresSigner(input))
      this.pipeline.assertCanSign(scope.activeAccount, "tron", opts);
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway, this.now),
      preflight: null,
      signerOptions: opts,
      confirm: tronConfirmation(gateway, scope),
      build: (owner) => build(gateway, owner),
      estimate: async () => ({ feeModel: "tron-resource", note: "staking ops cost bandwidth" }),
    });
    const echoed = Object.fromEntries(
      (["amountSun", "resource", "receiver"] as const)
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    );
    return { kind, ...outcomeData(outcome), ...echoed };
  }

  private assertDifferentReceiver(owner: string, receiver: string): void {
    if (receiver === owner) {
      throw new UsageError(
        "invalid_value",
        errorMessage`${inputRef("receiver")} must differ from the owner address`,
      );
    }
  }
}
