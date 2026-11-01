import { requestDispatchCheck } from "../../services/command-deadline.js";
import type {
  NetworkDescriptor,
  TronTransactionArtifact,
  OfflineTxSignView,
  TronProtocolValue,
  TxSignTransactionView,
} from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { operationForContractType } from "../../../domain/tron/permission/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { SignerResolver } from "../../services/signer/index.js";
import type { SigningService } from "../../services/signing/signing-service.js";
import type { TransactionArtifactWriter } from "../../ports/transaction-artifact-writer.js";
import { localTxId } from "../../services/broadcast-identity.js";
import { assertNotExpired, expirationOf, transactionContract } from "./transaction-artifact.js";
import type { TronHexSigner, TronSignOptions } from "./tron-signing.js";

// Signs artifacts without querying permission or approval endpoints.
export class TronSigService implements TronHexSigner {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly signers: SignerResolver,
    private readonly signing: SigningService,
    private readonly artifacts: TransactionArtifactWriter,
    private readonly now: () => number = () => Date.now(),
  ) {}

  // `out` is the file the user chose for the signed hex.
  async sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
    options: TronSignOptions,
    out?: string,
  ): Promise<OfflineTxSignView> {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const transaction = gateway.decodeTransactionHex(hex);
    const { signer, decoded, signedHex } = await this.#sign(
      scope,
      network,
      gateway,
      transaction,
      transaction,
      options,
    );
    const view: OfflineTxSignView = {
      kind: "tx-sign",
      signer: signer.address,
      hex: signedHex,
      checked: false,
      transaction: this.#transactionView(gateway, decoded),
    };
    if (out === undefined) return view;
    this.artifacts.write(out, signedHex);
    return { ...view, out };
  }

  // The JSON form of an artifact; the signer receives the caller's object, checked like the hex form.
  async signJson(
    scope: TransactionScope,
    network: NetworkDescriptor,
    json: TronProtocolValue,
    options: TronSignOptions,
  ) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const { transaction, hex } = gateway.encodeTransactionJson(json);
    const original = gateway.decodeTransactionHex(hex);
    const { signer, signed } = await this.#sign(
      scope,
      network,
      gateway,
      original,
      transaction,
      options,
    );
    return {
      kind: "sign" as const,
      mode: "sign-only" as const,
      signed,
      address: signer.address,
      txId: localTxId(signed) ?? original.txID,
    };
  }

  async #sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    gateway: TronGateway,
    original: TronTransactionArtifact,
    transaction: TronTransactionArtifact,
    options: TronSignOptions,
  ) {
    assertNotExpired(original, this.now());
    const previousSignatures = [...(original.signature ?? [])];

    this.signers.assertCanSign(scope.activeAccount, "tron");
    const signer = this.signers.resolve(scope.activeAccount, "tron");
    if (options.expectedSigner !== undefined && signer.address !== options.expectedSigner) {
      throw new ChainError(
        "signing_rejected",
        "resolved signer does not match the signer that passed authorization",
      );
    }
    const signed = await this.signing.sign(scope, {
      network,
      origin: options.origin,
      signer,
      payload: { kind: "transaction", transaction },
    });
    const signedHex = gateway.encodeTransactionHex(signed);
    const decoded = gateway.decodeTransactionHex(signedHex);
    if (decoded.txID !== original.txID || decoded.raw_data_hex !== original.raw_data_hex) {
      throw new ChainError(
        "invalid_transaction",
        "signer changed the transaction raw_data or txID",
      );
    }
    const current = decoded.signature ?? [];
    if (
      current.length !== previousSignatures.length + 1 ||
      previousSignatures.some((signature, index) => current[index] !== signature)
    ) {
      throw new ChainError(
        "signing_rejected",
        "signer did not append exactly one signature while preserving prior approvals",
      );
    }
    assertNotExpired(decoded, this.now());
    return { signer, signed, signedHex, decoded };
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
}
