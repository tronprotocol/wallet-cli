import type { NetworkDescriptor, TxReceiptKind, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { toRpcCode, type Resource } from "../../../domain/resources/index.js";
import type { AccountScope, TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

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
  staked: { energySun: string; bandwidthSun: string };
  votingPower: { total: number; used: number; available: number };
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
  canDelegateMaxSun?: { energy: string; bandwidth: string };
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
  ) {}

  /** voting power (TP) — 1 TP = 1 staked TRX. Public: vote status (Leon) consumes this. */
  async votingPower(
    network: NetworkDescriptor,
    address: string,
  ): Promise<{ total: number; used: number; available: number }> {
    const res = await this.gateways.get(network, "tron").getAccountResources(address);
    const total = Number((res as Record<string, unknown>).tronPowerLimit ?? 0);
    const used = Number((res as Record<string, unknown>).tronPowerUsed ?? 0);
    return { total, used, available: total - used };
  }

  async info(scope: AccountScope, network: NetworkDescriptor): Promise<StakeInfoView> {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron");
    const [account, resources, withdrawableSun, remaining] = await Promise.all([
      gateway.getAccount(address),
      gateway.getAccountResources(address),
      gateway.getCanWithdrawUnfreezeAmount(address),
      gateway.getAvailableUnfreezeCount(address),
    ]);
    const unfrozen = account.unfrozenV2 ?? [];
    const r = resources as Record<string, number | undefined>;
    const total = Number(r.tronPowerLimit ?? 0);
    const used = Number(r.tronPowerUsed ?? 0);
    return {
      address,
      staked: {
        energySun: stakedSun(account, "energy").toString(),
        bandwidthSun: stakedSun(account, "bandwidth").toString(),
      },
      votingPower: { total, used, available: total - used },
      resource: {
        energy: { used: Number(r.EnergyUsed ?? 0), limit: Number(r.EnergyLimit ?? 0) },
        // bandwidth = free allowance + staked allowance (node reports them separately).
        bandwidth: {
          used: Number(r.NetUsed ?? 0) + Number(r.freeNetUsed ?? 0),
          limit: Number(r.NetLimit ?? 0) + Number(r.freeNetLimit ?? 0),
        },
      },
      unfreezing: unfrozen.map((u) => ({
        amountSun: String((u as Record<string, unknown>).unfreeze_amount ?? "0"),
        withdrawableAt: Number((u as Record<string, unknown>).unfreeze_expire_time ?? 0),
      })),
      withdrawableSun,
      unfreeze: { used: unfrozen.length, max: 32, remaining },
    };
  }

  async delegated(
    scope: AccountScope,
    network: NetworkDescriptor,
    input: { direction: "out" | "in"; resource?: Resource; to?: string },
  ): Promise<StakeDelegatedView> {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron");
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
    // one record carries both directions' balances; emit one row per resource with balance > 0.
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
    const [energy, bandwidth] = await Promise.all([
      gateway.getCanDelegatedMaxSize(address, "ENERGY"),
      gateway.getCanDelegatedMaxSize(address, "BANDWIDTH"),
    ]);
    return {
      address,
      direction: input.direction,
      canDelegateMaxSun: { energy, bandwidth },
      delegations: rows,
    };
  }

  freeze(scope: TransactionScope, network: NetworkDescriptor, input: StakeAmountInput) {
    return this.transact("stake-freeze", scope, network, input, async (gateway, owner) => {
      // Same reasoning as unfreeze's guard: the node rejects an over-balance stake, but --dry-run
      // never asks it, so without this a doomed request reports as fine.
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
      // Unstaking more than is staked is rejected by the node at broadcast time, but --dry-run
      // never reaches the node and would report a doomed request as fine. The staked amount is a
      // cheap, authoritative query — the same trade-off withdraw's guard makes above.
      const staked = stakedSun(await gateway.getAccount(owner), input.resource);
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
      // WithdrawExpireUnfreeze with nothing withdrawable passes the node's broadcast-time checks
      // but never confirms, leaving a phantom txid. Reject up front (dry-run too) — the amount is
      // a cheap, authoritative query, unlike duplicating the node's full validation rules.
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
    // Ledger TRON app firmware cannot sign CancelAllUnfreezeV2 — reject before any device I/O.
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
    return this.transact("stake-undelegate", scope, network, input, (gateway, owner) => {
      this.assertDifferentReceiver(owner, input.receiver);
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
    build: (gateway: TronGateway, owner: string) => Promise<UnsignedTx>,
    opts?: { requireSoftware?: boolean },
  ) {
    if (transactionRequiresSigner(input))
      this.pipeline.assertCanSign(scope.activeAccount, "tron", opts);
    const gateway = this.gateways.get(network, "tron");
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
      throw new UsageError("invalid_value", "--receiver must differ from the owner address");
    }
  }
}

/** Staked SUN for one resource. frozenV2 omits `type` for BANDWIDTH (node drops default enums). */
function stakedSun(
  account: { frozenV2?: Array<{ type?: unknown; amount?: string }> },
  resource: Resource,
): bigint {
  const want = toRpcCode(resource);
  return (account.frozenV2 ?? [])
    .filter((entry) => (entry.type ?? "BANDWIDTH") === want)
    .reduce((total, entry) => total + BigInt(entry.amount ?? "0"), 0n);
}
