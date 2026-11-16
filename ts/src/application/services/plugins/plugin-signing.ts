import type {
  AccountSelector,
  ChainFamily,
  NetworkDescriptor,
} from "../../../domain/types/index.js";
import type { TypedDataSignature } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { SignerResolver } from "../signer/index.js";
import type {
  MessagePayload,
  SigningService,
  TypedDataSignPayload,
} from "../signing/signing-service.js";

export interface PluginSignRequest<P> {
  readonly network: NetworkDescriptor;
  readonly family: ChainFamily;
  readonly payload: P;
}

// Signs for plugin code: the signer is resolved here, never handed out, and every payload passes the
// signing entry as origin "service", so its chain identity checks apply.
export class PluginSigning {
  constructor(
    private readonly signers: Pick<SignerResolver, "assertCanSign" | "resolve">,
    private readonly signing: Pick<SigningService, "sign">,
  ) {}

  assertCanSign(account: AccountSelector, family: ChainFamily): void {
    this.signers.assertCanSign(account, family);
  }

  signerAddress(account: AccountSelector, family: ChainFamily): string {
    return this.signers.resolve(account, family).address;
  }

  sign(scope: TransactionScope, request: PluginSignRequest<MessagePayload>): Promise<string>;
  sign(
    scope: TransactionScope,
    request: PluginSignRequest<TypedDataSignPayload>,
  ): Promise<TypedDataSignature>;
  async sign(
    scope: TransactionScope,
    request: PluginSignRequest<MessagePayload | TypedDataSignPayload>,
  ): Promise<string | TypedDataSignature> {
    this.signers.assertCanSign(scope.activeAccount, request.family);
    const signRequest = {
      network: request.network,
      origin: "service" as const,
      signer: this.signers.resolve(scope.activeAccount, request.family),
    };
    return request.payload.kind === "message"
      ? this.signing.sign(scope, { ...signRequest, payload: request.payload })
      : this.signing.sign(scope, { ...signRequest, payload: request.payload });
  }
}
