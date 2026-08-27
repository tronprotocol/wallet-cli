import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { FAMILIES } from "../../../domain/family/index.js";
import { fromBaseUnits, toBaseUnits } from "../../../domain/amounts/index.js";
import { evmConfirmation } from "../../services/evm-confirmation.js";
import { approveRows } from "../../services/approve-receipt.js";
import { buildEvmUnsignedTx } from "./tx-build.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type {
  ChainGatewayProvider,
  DeployConstructorArgs,
  EvmGateway,
} from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";

export interface EvmContractWriteInput extends TransactionModeInput {
  contract?: string;
  method?: string;
  /** `{type,value}` entries for a call; raw positional values for a deployment. */
  params?: unknown[];
  /** native coin sent along with the call, in whole coins (as `tx send --amount` is). */
  callValue?: string;
  bytecode?: string;
  /** how the constructor's arguments are typed and what they are; see DeployConstructorArgs. */
  constructorArgs?: DeployConstructorArgs;
  gasLimit?: string;
  maxFee?: string;
  priorityFee?: string;
  nonce?: number;
}

/**
 * Contract reads and writes.
 *
 * Writes go through the shared pipeline, so the fee model, the pending-nonce rule and the
 * broadcast guard are the same ones `tx send` uses rather than a second copy.
 */
export class EvmContractService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  /**
   * A read-only call. The result comes back as raw hex, exactly as TRON's already does: a
   * signature declares its parameter types and nothing about its return, so there is nothing to
   * decode against without guessing.
   */
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

    // Resolved BEFORE the run so `--dry-run` carries it too: the allowance is the one thing a
    // dry run of an approve exists to confirm (§6.1 names it one of only two dry-run extras).
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

  /** §7.2's approve receipt; the shared helper does the work, this supplies the EVM specifics. */
  async #approval(
    gateway: EvmGateway,
    input: EvmContractWriteInput,
  ): Promise<Record<string, unknown>> {
    return approveRows({
      method: input.method,
      params: (input.params ?? []) as Array<{ value?: unknown }>,
      metadata: () => gateway.getErc20Metadata(input.contract!),
      fromBaseUnits,
    });
  }

  /**
   * Deploy a contract. The transaction has no recipient — that is what makes it a deployment —
   * and the address is derived from the sender and nonce rather than waited for, because CREATE
   * determines it entirely from those two.
   */
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
    call: Record<string, unknown>,
    onNonce?: (from: string, nonce: string) => void,
  ) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "evm");
    let plan: Record<string, unknown> = {};
    return this.pipeline.run({
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
          onNonce,
        });
        for (const warning of built.warnings ?? []) scope.warn(warning);
        plan = built.fee;
        return built.tx;
      },
    });
  }
}
