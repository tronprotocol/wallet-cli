import type { ExecutionDeadline } from "../../contracts/deadline.js";
import { systemWallClock, type WallClock } from "../../contracts/wall-clock.js";
import type {
  NetworkDescriptor,
  CheckedTxSignView,
  TronTransactionArtifact,
  TxApprovalView,
} from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { waitsForConfirmation } from "../../services/transaction-mode.js";
import { operationForContractType } from "../../../domain/tron/permission/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { submitAndStage } from "../../services/submit-and-stage.js";
import { assertTronReferenceBlock } from "../../services/signing/chain-identity.js";
import { localTxId } from "../../services/broadcast-identity.js";
import { requestDispatchCheck } from "../../services/command-deadline.js";
import type { TransactionArtifactWriter } from "../../ports/transaction-artifact-writer.js";
import {
  assertThresholdReached,
  assertTronSignerAuthorized,
  authorizationState,
} from "./multisig-authorization.js";
import { assertNotExpired, expirationOf, transactionContract } from "./transaction-artifact.js";
import type { TronCheckedSigner, TronHexSigner } from "./tron-signing.js";

export class TronMultisigService implements TronCheckedSigner {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly signing: TronHexSigner,
    private readonly artifacts: TransactionArtifactWriter,
    private readonly now: WallClock = systemWallClock,
  ) {}

  async approvals(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    hex: string,
  ): Promise<TxApprovalView> {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    const transaction = gateway.decodeTransactionHex(hex);
    await assertTronReferenceBlock(gateway, network, transaction);
    return this.#approvalFor(gateway, transaction);
  }

  // `out` is the file the user chose for the signed hex.
  async signChecked(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
    out?: string,
  ): Promise<CheckedTxSignView> {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const transaction = gateway.decodeTransactionHex(hex);
    // Wrong-network permission facts must not reach the signer; the signing entry checks again.
    await assertTronReferenceBlock(gateway, network, transaction);
    const expectedSigner = scope.resolveAddress("tron");
    await assertTronSignerAuthorized(gateway, transaction, expectedSigner, this.now());

    const signed = await this.signing.sign(scope, network, hex, {
      origin: "imported",
      expectedSigner,
    });
    const approval = await this.#approvalFor(gateway, gateway.decodeTransactionHex(signed.hex));
    const approvedSigner = approval.approved.find((approved) => approved.address === signed.signer);
    if (!approvedSigner) {
      throw new ChainError(
        "signing_rejected",
        "node did not recognize the newly appended signature",
      );
    }
    const view: CheckedTxSignView = {
      ...signed,
      checked: true,
      signerWeight: approvedSigner.weight,
      approval,
    };
    if (out === undefined) return view;
    this.artifacts.write(out, signed.hex);
    return { ...view, out };
  }

  async broadcastHex(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
    dryRun: boolean,
  ) {
    waitsForConfirmation(scope.wait, !dryRun);
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const transaction = gateway.decodeTransactionHex(hex);
    const approval = await this.#assertBroadcastable(gateway, network, transaction);
    const multiSignFeeSun = approval.signatures > 1 ? await gateway.getMultiSignFee() : 0;
    if (dryRun) {
      return {
        kind: "broadcast" as const,
        mode: "dry-run" as const,
        transaction: approval,
        multiSignFeeSun,
      };
    }
    const outcome = await submitAndStage(
      "tron",
      scope,
      localTxId(transaction),
      (check) => gateway.broadcastHex(hex, check),
      (txId) => tronConfirmation(gateway, scope)(txId, transaction),
    );
    return {
      kind: "broadcast" as const,
      ...outcome,
      transaction: approval,
      multiSignFeeSun,
    };
  }

  async broadcastJson(
    scope: TransactionScope,
    network: NetworkDescriptor,
    transaction: TronTransactionArtifact,
    dryRun: boolean,
  ) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    return this.broadcastHex(scope, network, gateway.encodeTransactionHex(transaction), dryRun);
  }

  async #assertBroadcastable(
    gateway: TronGateway,
    network: NetworkDescriptor,
    transaction: TronTransactionArtifact,
  ) {
    assertNotExpired(transaction, this.now());
    await assertTronReferenceBlock(gateway, network, transaction);
    const approval = await this.#approvalFor(gateway, transaction);
    assertThresholdReached(approval.currentWeight, approval.permission.threshold);
    return approval;
  }

  async #approvalFor(
    gateway: TronGateway,
    transaction: TronTransactionArtifact,
  ): Promise<TxApprovalView> {
    const { weight, approved, permission } = await authorizationState(gateway, transaction);
    const expiration = expirationOf(transaction);
    const contractType = transactionContract(transaction).type;
    const decoded = gateway.decodeTransaction(transaction);
    const keyWeights = new Map(permission.keys.map((key) => [key.address, key.weight]));
    return {
      txId: transaction.txID,
      contractType,
      operation: operationForContractType(contractType)?.label,
      from: decoded.from,
      to: decoded.to,
      rawAmount: decoded.rawAmount,
      tokenContract: decoded.tokenContract,
      permission: {
        id: permission.id,
        name: permission.name,
        threshold: permission.threshold,
      },
      currentWeight: weight.currentWeight,
      missingWeight: Math.max(0, permission.threshold - weight.currentWeight),
      thresholdReached: weight.currentWeight >= permission.threshold,
      approved: approved.map((address) => ({ address, weight: keyWeights.get(address)! })),
      expiration,
      expired: expiration <= this.now(),
      signatures: transaction.signature?.length ?? 0,
    };
  }
}
