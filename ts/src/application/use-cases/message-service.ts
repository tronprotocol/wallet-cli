import type { AccountRef, NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { SignerResolver } from "../services/signer/index.js";
import type { SignOrigin, SigningService } from "../services/signing/signing-service.js";

export class MessageService {
  constructor(
    private readonly signers: SignerResolver,
    private readonly signing: SigningService,
  ) {}

  async sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    account: AccountRef,
    message: string,
    origin: SignOrigin = "imported",
  ) {
    // Reject watch-only accounts before resolving a signer.
    this.signers.assertCanSign(account, network.family);
    const signer = this.signers.resolve(account, network.family);
    return {
      address: signer.address,
      message,
      signature: await this.signing.sign(scope, {
        network,
        origin,
        signer,
        payload: { kind: "message", message },
      }),
    };
  }
}
