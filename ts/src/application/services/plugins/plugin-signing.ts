import type {
  AccountSelector,
  ChainFamily,
  NetworkDescriptor,
} from "../../../domain/types/index.js";
import type { TypedDataSignature } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { SignerResolver } from "../signer/index.js";
import type { SigningService, TypedDataSignPayload } from "../signing/signing-service.js";

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

  async sign(
    scope: TransactionScope,
    request: PluginSignRequest<TypedDataSignPayload>,
  ): Promise<TypedDataSignature> {
    return this.signing.sign(scope, {
      network: request.network,
      origin: "service",
      signer: this.signers.resolve(scope.activeAccount, request.family),
      payload: request.payload,
    });
  }
}
