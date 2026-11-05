// The only path to a signature: checks the payload's chain identity against the named network first,
// and that a device signature recovers to the signing account over the payload it was sent.
import type {
  NetworkDescriptor,
  SignedTx,
  SignedTxOf,
  Signer,
  SignerSignOpts,
  TypedDataPayload,
  TypedDataSignature,
  UnsignedTx,
  WarningView,
} from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import {
  assertEvmTransactionChain,
  assertTronReferenceBlock,
  assertTypedDataChain,
} from "./chain-identity.js";
import { assertSignedBy, type SignatureDigests, type SignedPayload } from "./signature-check.js";
import { DeadlineExpiredError, type ExecutionDeadline } from "../../contracts/deadline.js";
import { endedByDeadline, requestDispatchCheck, untilDeadline } from "../command-deadline.js";

// How long a newly built TRON transaction stays valid for review on a device; independent of the
// command deadline so that --timeout 0 still yields a finite, protocol-valid expiration.
export const DEVICE_REVIEW_MS = 90_000;

export interface SigningScope {
  readonly deadline: ExecutionDeadline;
  emit(event: { type: "awaiting_device"; reason: "sign" }): void;
  warn?(message: string | WarningView): void;
}

export type SignOrigin =
  // Built by this app from the named network's node.
  | "built"
  // Produced by a protocol SDK or service for the named network.
  | "service"
  // Supplied by the user and checked against the named network's node.
  | "imported"
  // Supplied by the user and signed without contacting a node.
  | "offline";

export type TransactionPayload<T extends UnsignedTx = UnsignedTx> = {
  readonly kind: "transaction";
  readonly transaction: T;
};
export type MessagePayload = { readonly kind: "message"; readonly message: string };
export type TypedDataSignPayload = {
  readonly kind: "typed-data";
  readonly typedData: TypedDataPayload;
};
export type SignPayload = TransactionPayload | MessagePayload | TypedDataSignPayload;

export interface SignRequest<P extends SignPayload = SignPayload> {
  readonly network: NetworkDescriptor;
  readonly origin: SignOrigin;
  readonly signer: Signer;
  readonly payload: P;
}

export const NETWORK_NOT_VERIFIED_WARNING = "network_not_verified";

export class SigningService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  // Signer.sign returns the SignedTx union; the transaction overload trusts it to keep the family.
  async sign<T extends UnsignedTx>(
    scope: SigningScope,
    request: SignRequest<TransactionPayload<T>>,
  ): Promise<SignedTxOf<T>>;
  async sign(scope: SigningScope, request: SignRequest<MessagePayload>): Promise<string>;
  async sign(
    scope: SigningScope,
    request: SignRequest<TypedDataSignPayload>,
  ): Promise<TypedDataSignature>;
  async sign(
    scope: SigningScope,
    request: SignRequest,
  ): Promise<SignedTx | string | TypedDataSignature> {
    await this.#assertChainIdentity(scope, request);
    const { signer, payload } = request;
    const signed = await deviceBounded<SignedPayload>(signer, scope, async (opts) => {
      switch (payload.kind) {
        case "transaction":
          return {
            kind: "transaction",
            sent: payload.transaction,
            result: await signer.sign(payload.transaction, opts),
          };
        case "message":
          return {
            kind: "message",
            sent: payload.message,
            result: await signer.signMessage(payload.message, opts),
          };
        case "typed-data":
          return {
            kind: "typed-data",
            sent: payload.typedData,
            result: await signer.signTypedData(payload.typedData, opts),
          };
      }
    });
    // A device reply arrives over a shared transport, so it is checked before anything uses it.
    if (signer.kind === "device") {
      assertSignedBy(
        this.#digests(scope, request.network),
        request.network,
        signer.address,
        signed,
      );
    }
    return signed.result;
  }

  #digests(scope: SigningScope, network: NetworkDescriptor): SignatureDigests {
    const check = requestDispatchCheck(scope.deadline);
    return {
      tron: () => this.gateways.get(network, "tron", check),
      evm: () => this.gateways.get(network, "evm", check),
    };
  }

  async #assertChainIdentity(scope: SigningScope, request: SignRequest): Promise<void> {
    const { network, origin, payload } = request;
    if (payload.kind === "typed-data") return assertTypedDataChain(payload.typedData, network);
    if (payload.kind !== "transaction") return;
    if (network.family === "evm") {
      const chainId = this.gateways
        .get(network, "evm", requestDispatchCheck(scope.deadline))
        .transactionChainId(payload.transaction);
      return assertEvmTransactionChain(chainId, network);
    }
    // A transaction this app built came from the named network's node.
    if (origin === "built") return;
    if (origin === "offline") {
      scope.warn?.({
        code: NETWORK_NOT_VERIFIED_WARNING,
        message: `signed without contacting a node, so it was not verified that this transaction is for ${network.id}`,
      });
      return;
    }
    await assertTronReferenceBlock(
      this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline)),
      network,
      payload.transaction,
    );
  }
}

// No signer starts after expiry. Check device identity before signing; the deadline signal cancels
// the device prompt, and any failure after expiry is the deadline's timeout, not a user cancellation.
async function deviceBounded<T>(
  signer: Signer,
  scope: SigningScope,
  produce: (opts: SignerSignOpts) => Promise<T>,
): Promise<T> {
  const { deadline } = scope;
  if (signer.kind !== "device") {
    deadline.assertActive();
    return produce({});
  }
  await signer.precheck?.(deadline.signal);
  deadline.assertActive();
  scope.emit({ type: "awaiting_device", reason: "sign" });
  try {
    return await untilDeadline(
      produce({
        signal: deadline.signal,
        ...(scope.warn ? { onWarning: (message: string) => scope.warn!(message) } : {}),
      }),
      deadline,
    );
  } catch (error) {
    if (endedByDeadline(error, deadline)) throw new DeadlineExpiredError();
    throw error;
  }
}
