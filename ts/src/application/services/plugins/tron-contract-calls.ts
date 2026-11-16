import { sunAmount, type Sun } from "../../../domain/amounts/index.js";
import type { FeeReport, NetworkDescriptor, TxOutcome } from "../../../domain/types/index.js";
import { DEFAULT_FEE_LIMIT_SUN } from "../../../domain/fees/tron.js";
import type { DispatchCheck } from "../../contracts/deadline.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ContractCallPayload } from "../../contracts/tron/tron-contract-call.js";
import type { WallClock } from "../../contracts/wall-clock.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { Broadcaster } from "../../ports/chain/broadcaster.js";
import {
  assertTronSignerAuthorized,
  tronTransactionHooks,
} from "../../use-cases/tron/multisig-authorization.js";
import { localTxId } from "../broadcast-identity.js";
import { requestDispatchCheck } from "../command-deadline.js";
import type { TxPipeline } from "../pipeline/index.js";
import type { ResolvedTransactionMode } from "../transaction-mode.js";
import { resolveTronAccount } from "../tron/tron-account.js";
import { tronConfirmation } from "../tron/tron-confirmation.js";

export interface TronCallOptions {
  readonly mode: ResolvedTransactionMode;
  // False when the call depends on a transaction that is not on chain yet, so simulating it would revert.
  readonly estimable: boolean;
  readonly feeLimit?: Sun;
  // For a step that later steps depend on: a confirmation wait that stops on an error throws it.
  readonly confirmationRequired?: boolean;
  // Called with the txId right before the signed transaction is sent, before the node answers.
  readonly onDispatched?: (txId: string) => void;
  // Called with the txId once the node accepted the transaction, before its confirmation wait.
  readonly onSubmitted?: (txId: string) => void;
}

const FEE_NOT_YET_ESTIMABLE: FeeReport = {
  feeModel: "tron-resource",
  note: "not estimable until the approval is on-chain",
};

// One TRON contract call through the transaction lifecycle, for plugin code.
export class TronContractCalls {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
    private readonly now: WallClock,
  ) {}

  async run(
    scope: TransactionScope,
    network: NetworkDescriptor,
    payload: ContractCallPayload,
    options: TronCallOptions,
  ): Promise<TxOutcome> {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const confirm = tronConfirmation(gateway, scope);
    return this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: dispatchNotifying(gateway, options.onDispatched),
      ...options.mode,
      ...tronTransactionHooks(gateway, this.now),
      // Check signer membership before signing; enforce the combined threshold before broadcast.
      preflight: (tx, signer) => assertTronSignerAuthorized(gateway, tx, signer, this.now()),
      confirm: (txId, signed) => {
        options.onSubmitted?.(txId);
        return confirm(txId, signed);
      },
      confirmationRequired: options.confirmationRequired === true,
      build: async (from) =>
        gateway.triggerSmartContract(
          from,
          payload.target,
          payload.method,
          [...payload.parameters],
          {
            // The node requires both fields, including zero call value for token-only calls.
            callValue: payload.callValueSun ?? sunAmount("0"),
            feeLimit: options.feeLimit ?? DEFAULT_FEE_LIMIT_SUN,
            permissionId: 0,
          },
        ),
      estimate: this.#estimatorFor(scope, network, payload, options.estimable),
    });
  }

  // Estimation simulates execution and reverts until required allowances are on-chain.
  #estimatorFor(
    scope: TransactionScope,
    network: NetworkDescriptor,
    payload: ContractCallPayload,
    estimable: boolean,
  ): () => Promise<FeeReport> {
    if (!estimable) return async () => FEE_NOT_YET_ESTIMABLE;
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    return async () =>
      gateway.estimateResources(
        resolveTronAccount(scope),
        payload.target,
        payload.method,
        [...payload.parameters],
        payload.callValueSun,
      );
  }
}

// Reports the txId once, after the submit check passed and before the request is sent.
function dispatchNotifying(
  broadcaster: Broadcaster,
  onDispatched: ((txId: string) => void) | undefined,
): Broadcaster {
  if (onDispatched === undefined) return broadcaster;
  return {
    broadcast: (signed, check) => {
      const txId = localTxId(signed);
      let notified = false;
      const notifying: DispatchCheck = {
        signal: check.signal,
        assertDispatchable: () => {
          check.assertDispatchable();
          if (!notified && txId !== undefined) {
            notified = true;
            onDispatched(txId);
          }
        },
      };
      return broadcaster.broadcast(signed, notifying);
    },
  };
}
