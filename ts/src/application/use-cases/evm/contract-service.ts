import type { EvmContractWriteInput } from "../../contracts/transaction-input.js";
export type { EvmContractWriteInput } from "../../contracts/transaction-input.js";
import type { EvmFeeReport, NetworkDescriptor } from "../../../domain/types/index.js";
import { FAMILIES } from "../../../domain/family/index.js";
import { fromBaseUnits, toBaseUnits } from "../../../domain/amounts/index.js";
import { evmConfirmation } from "../../services/evm-confirmation.js";
import { approveRows } from "../../services/approve-receipt.js";
import { buildEvmUnsignedTx, type EvmCall } from "./tx-build.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider, EvmGateway } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../services/transaction-mode.js";

export class EvmContractService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  // Return raw hex: a method signature supplies parameter types, not return types.
  async call(
    network: NetworkDescriptor,
    contract: string,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ) {
    return {
      contract,
      method,
      result: await this.gateways.get(network, "evm").callFunction(contract, method, params),
    };
  }

  async send(scope: TransactionScope, network: NetworkDescriptor, input: EvmContractWriteInput) {
    const gateway = this.gateways.get(network, "evm");
    let nonce: string | undefined;
    const data = gateway.encodeFunctionCall(
      input.method!,
      (input.params ?? []) as Array<{ type: string; value: unknown }>,
    );
    const value =
      input.callValue === undefined
        ? "0"
        : toBaseUnits(input.callValue, FAMILIES.evm.nativeDecimals, "call value");

    // Include approval details in dry-run output too.
    const approval = await this.#approval(gateway, input);

    const outcome = await this.#run(
      scope,
      network,
      gateway,
      input,
      { to: input.contract!, data, value },
      (_from, built) => {
        nonce = built;
      },
    );
    return {
      kind: "contract-send" as const,
      ...outcomeData(outcome),
      ...(nonce === undefined ? {} : { nonce: Number(nonce) }),
      ...approval,
      contract: input.contract,
      method: input.method,
    };
  }

  async #approval(
    gateway: EvmGateway,
    input: EvmContractWriteInput,
  ): Promise<Record<string, unknown>> {
    return approveRows({
      method: input.method,
      params: (input.params ?? []) as Array<{ value?: unknown }>,
      approvalKind: input.approvalKind,
      metadata: () => gateway.getErc20Metadata(input.contract!),
      fromBaseUnits,
    });
  }

  // CREATE determines the address from sender and nonce before mining.
  async deploy(scope: TransactionScope, network: NetworkDescriptor, input: EvmContractWriteInput) {
    const gateway = this.gateways.get(network, "evm");
    const data = gateway.encodeDeploy(input.bytecode!, input.constructorArgs ?? { source: "none" });
    let contractAddress: string | undefined;
    let nonce: string | undefined;

    const outcome = await this.#run(
      scope,
      network,
      gateway,
      input,
      { data, value: "0" },
      (from, built) => {
        nonce = built;
        contractAddress = gateway.contractAddressFor(from, built);
      },
    );
    return {
      kind: "contract-deploy" as const,
      ...outcomeData(outcome),
      ...(nonce === undefined ? {} : { nonce: Number(nonce) }),
      ...(contractAddress === undefined ? {} : { contractAddress }),
    };
  }

  async #run(
    scope: TransactionScope,
    network: NetworkDescriptor,
    gateway: EvmGateway,
    input: EvmContractWriteInput,
    call: EvmCall,
    onNonce?: (from: string, nonce: string) => void,
  ) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "evm");
    let plan = {} as EvmFeeReport;
    return this.pipeline.runEvm({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      confirm: evmConfirmation(gateway, scope),
      artifact: (tx) => gateway.encodeTransactionHex(tx),
      estimate: async () => plan,
      build: async (from) => {
        const built = await buildEvmUnsignedTx({
          gateway,
          network,
          from,
          call,
          input,
          dryRun: input.dryRun,
          onNonce,
        });
        for (const warning of built.warnings ?? []) scope.warn(warning);
        plan = built.fee;
        return built.tx;
      },
    });
  }
}
