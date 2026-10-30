// The only path to a signature: checks the payload's chain identity against the named network first.
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
import { withTimeout } from "../../../domain/async/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import {
  assertEvmTransactionChain,
  assertTronReferenceBlock,
  assertTypedDataChain,
} from "./chain-identity.js";

export interface SigningScope {
  readonly timeoutMs: number;
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
    return deviceBounded<SignedTx | string | TypedDataSignature>(signer, scope, (opts) => {
      switch (payload.kind) {
        case "transaction":
          return signer.sign(payload.transaction, opts);
        case "message":
          return signer.signMessage(payload.message, opts);
        case "typed-data":
          return signer.signTypedData(payload.typedData, opts);
      }
    });
  }

  async #assertChainIdentity(scope: SigningScope, request: SignRequest): Promise<void> {
    const { network, origin, payload } = request;
    if (payload.kind === "typed-data") return assertTypedDataChain(payload.typedData, network);
    if (payload.kind !== "transaction") return;
    if (network.family === "evm") {
      const chainId = this.gateways.get(network, "evm").transactionChainId(payload.transaction);
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
      this.gateways.get(network, "tron"),
      network,
      payload.transaction,
    );
  }
}

// Check device identity before signing; abort a timed-out signature to cancel the device prompt.
async function deviceBounded<T>(
  signer: Signer,
  scope: SigningScope,
  produce: (opts: SignerSignOpts) => Promise<T>,
): Promise<T> {
  if (signer.kind !== "device") return produce({});
  await signer.precheck?.();
  scope.emit({ type: "awaiting_device", reason: "sign" });
  const ac = new AbortController();
  return withTimeout(
    produce({
      signal: ac.signal,
      ...(scope.warn ? { onWarning: (message: string) => scope.warn!(message) } : {}),
    }),
    scope.timeoutMs,
    () => ac.abort(),
  );
}
