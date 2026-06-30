import type { NetworkDescriptor, TxReceiptKind, UnsignedTx } from "../../../domain/types/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import { toRpcCode, type Resource } from "../../../domain/resources/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData, transactionMode, type TransactionModeInput } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";

export interface StakeAmountInput extends TransactionModeInput {
  amountSun: string;
  resource: Resource;
}

export interface StakeDelegateInput extends StakeAmountInput {
  receiver: string;
  lock?: boolean;
  lockPeriod?: number;
}

export class TronStakeService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  freeze(scope: TransactionScope, network: NetworkDescriptor, input: StakeAmountInput) {
    return this.transact("stake-freeze", scope, network, input,
      (gateway, owner) => gateway.buildFreezeV2(owner, input.amountSun, toRpcCode(input.resource)));
  }

  unfreeze(scope: TransactionScope, network: NetworkDescriptor, input: StakeAmountInput) {
    return this.transact("stake-unfreeze", scope, network, input,
      (gateway, owner) => gateway.buildUnfreezeV2(owner, input.amountSun, toRpcCode(input.resource)));
  }

  withdraw(scope: TransactionScope, network: NetworkDescriptor, input: TransactionModeInput) {
    return this.transact("stake-withdraw", scope, network, input,
      (gateway, owner) => gateway.buildWithdrawExpireUnfreeze(owner));
  }

  cancelUnfreeze(scope: TransactionScope, network: NetworkDescriptor, input: TransactionModeInput) {
    return this.transact("stake-cancel", scope, network, input,
      (gateway, owner) => gateway.buildCancelAllUnfreezeV2(owner));
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
  ) {
    const gateway = this.gateways.get(network, "tron");
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      confirm: tronConfirmation(gateway, scope),
      build: (owner) => build(gateway, owner),
      estimate: async () => ({ feeModel: "tron-resource", note: "staking ops cost bandwidth" }),
    });
    const echoed = Object.fromEntries(
      (["amountSun", "resource", "receiver"] as const)
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    );
    return { kind, family: "tron" as const, ...outcomeData(outcome), ...echoed };
  }

  private assertDifferentReceiver(owner: string, receiver: string): void {
    if (receiver === owner) {
      throw new UsageError("invalid_value", "--receiver must differ from the owner address");
    }
  }
}
