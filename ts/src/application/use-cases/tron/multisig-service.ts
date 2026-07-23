import type {
  NetworkDescriptor,
  Signer,
  TronTransactionArtifact,
  TxApprovalView,
} from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { operationForContractType } from "../../../domain/permission/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { SignerResolver } from "../../services/signer/index.js";
import { obtainSignature } from "../../services/signing/obtain-signature.js";
import { stageTronBroadcast } from "../../services/tron-confirmation.js";
import {
  assertNotExpired,
  assertTronSignerAuthorized,
  authorizationState,
  expirationOf,
  transactionContract,
} from "./multisig-authorization.js";

export class TronMultisigService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly signers: SignerResolver,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async approvals(network: NetworkDescriptor, hex: string): Promise<TxApprovalView> {
    const gateway = this.gateways.get(network, "tron");
    return this.#approvalFor(gateway, gateway.decodeTransactionHex(hex));
  }

  async sign(scope: TransactionScope, network: NetworkDescriptor, hex: string) {
    const gateway = this.gateways.get(network, "tron");
    const transaction = gateway.decodeTransactionHex(hex);
    assertNotExpired(transaction, this.now());
    const originalTxId = transaction.txID;
    const originalRawDataHex = transaction.raw_data_hex;
    const previousSignatures = [...(transaction.signature ?? [])];

    this.signers.assertCanSign(scope.activeAccount, "tron");
    const signer = this.signers.resolve(scope.activeAccount, "tron");
    await assertTronSignerAuthorized(gateway, transaction, signer.address, this.now());

    const signed = await this.#sign(signer, transaction, scope);
    const signedHex = gateway.encodeTransactionHex(signed);
    const decoded = gateway.decodeTransactionHex(signedHex);
    if (decoded.txID !== originalTxId || decoded.raw_data_hex !== originalRawDataHex) {
      throw new ChainError("invalid_transaction", "signer changed the transaction raw_data or txID");
    }
    const current = decoded.signature ?? [];
    if (current.length !== previousSignatures.length + 1
      || previousSignatures.some((signature, index) => current[index] !== signature)) {
      throw new ChainError("signing_rejected", "signer did not append exactly one signature while preserving prior approvals");
    }

    const transactionView = await this.#approvalFor(gateway, decoded);
    const approvedSigner = transactionView.approved.find((approved) => approved.address === signer.address);
    if (!approvedSigner) {
      throw new ChainError("signing_rejected", "node did not recognize the newly appended signature");
    }
    assertNotExpired(decoded, this.now());
    return {
      kind: "tx-sign" as const,
      signer: signer.address,
      signerWeight: approvedSigner.weight,
      hex: signedHex,
      transaction: transactionView,
    };
  }

  async broadcastHex(scope: TransactionScope, network: NetworkDescriptor, hex: string, dryRun: boolean) {
    const gateway = this.gateways.get(network, "tron");
    const transaction = gateway.decodeTransactionHex(hex);
    const approval = await this.#assertBroadcastable(gateway, transaction);
    const multiSignFeeSun = approval.signatures > 1 ? await gateway.getMultiSignFee() : 0;
    if (dryRun) {
      return { kind: "broadcast" as const, mode: "dry-run" as const, transaction: approval, multiSignFeeSun };
    }
    const result = await gateway.broadcastHex(hex);
    return {
      kind: "broadcast" as const,
      ...(await stageTronBroadcast(gateway, scope, result)),
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
    const gateway = this.gateways.get(network, "tron");
    return this.broadcastHex(scope, network, gateway.encodeTransactionHex(transaction), dryRun);
  }

  async #assertBroadcastable(gateway: TronGateway, transaction: TronTransactionArtifact) {
    assertNotExpired(transaction, this.now());
    const approval = await this.#approvalFor(gateway, transaction);
    if (!approval.thresholdReached) {
      throw new ChainError(
        "not_authorized",
        `signature threshold is not reached; missing ${approval.missingWeight} weight`,
      );
    }
    return approval;
  }

  async #approvalFor(gateway: TronGateway, transaction: TronTransactionArtifact): Promise<TxApprovalView> {
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

  #sign(signer: Signer, transaction: TronTransactionArtifact, scope: TransactionScope) {
    return obtainSignature(signer, scope, (options) => signer.sign(transaction, options));
  }
}
