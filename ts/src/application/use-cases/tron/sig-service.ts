import type {
  NetworkDescriptor,
  Signer,
  TronTransactionArtifact,
  OfflineTxSignView,
  TxSignTransactionView,
} from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { operationForContractType } from "../../../domain/permission/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { SignerResolver } from "../../services/signer/index.js";
import { obtainSignature } from "../../services/signing/obtain-signature.js";
import {
  assertNotExpired,
  expirationOf,
  transactionContract,
} from "./transaction-artifact.js";

export interface TronSignOptions {
  /** Bind an authorization decision to the exact signer before any signature interaction. */
  expectedSigner?: string;
}

/** Offline-capable TRON artifact signing. It never queries permission or approval endpoints. */
export class TronSigService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly signers: SignerResolver,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
    options: TronSignOptions = {},
  ): Promise<OfflineTxSignView> {
    const gateway = this.gateways.get(network, "tron");
    const transaction = gateway.decodeTransactionHex(hex);
    assertNotExpired(transaction, this.now());
    const originalTxId = transaction.txID;
    const originalRawDataHex = transaction.raw_data_hex;
    const previousSignatures = [...(transaction.signature ?? [])];

    this.signers.assertCanSign(scope.activeAccount, "tron");
    const signer = this.signers.resolve(scope.activeAccount, "tron");
    if (options.expectedSigner !== undefined && signer.address !== options.expectedSigner) {
      throw new ChainError(
        "signing_rejected",
        "resolved signer does not match the signer that passed authorization",
      );
    }
    const signed = await this.#sign(signer, transaction, scope);
    const signedHex = gateway.encodeTransactionHex(signed);
    const decoded = gateway.decodeTransactionHex(signedHex);
    if (decoded.txID !== originalTxId || decoded.raw_data_hex !== originalRawDataHex) {
      throw new ChainError("invalid_transaction", "signer changed the transaction raw_data or txID");
    }
    const current = decoded.signature ?? [];
    if (
      current.length !== previousSignatures.length + 1
      || previousSignatures.some((signature, index) => current[index] !== signature)
    ) {
      throw new ChainError(
        "signing_rejected",
        "signer did not append exactly one signature while preserving prior approvals",
      );
    }
    assertNotExpired(decoded, this.now());
    return {
      kind: "tx-sign",
      signer: signer.address,
      hex: signedHex,
      checked: false,
      transaction: this.#transactionView(gateway, decoded),
    };
  }

  #transactionView(
    gateway: TronGateway,
    transaction: TronTransactionArtifact,
  ): TxSignTransactionView {
    const contract = transactionContract(transaction);
    const decoded = gateway.decodeTransaction(transaction);
    const expiration = expirationOf(transaction);
    return {
      txId: transaction.txID,
      contractType: contract.type,
      operation: operationForContractType(contract.type)?.label,
      from: decoded.from,
      to: decoded.to,
      rawAmount: decoded.rawAmount,
      tokenContract: decoded.tokenContract,
      permissionId: contract.Permission_id ?? 0,
      expiration,
      expired: expiration <= this.now(),
      signatures: transaction.signature?.length ?? 0,
    };
  }

  #sign(signer: Signer, transaction: TronTransactionArtifact, scope: TransactionScope) {
    return obtainSignature(signer, scope, (options) => signer.sign(transaction, options));
  }
}
