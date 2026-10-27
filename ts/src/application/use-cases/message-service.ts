import type { AccountRef, ChainFamily } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { SignerResolver } from "../services/signer/index.js";
import { obtainSignature } from "../services/signing/obtain-signature.js";

export class MessageService {
  constructor(private readonly signers: SignerResolver) {}

  async sign(scope: TransactionScope, family: ChainFamily, account: AccountRef, message: string) {
    // Reject watch-only accounts before resolving a signer.
    this.signers.assertCanSign(account, family);
    const signer = this.signers.resolve(account, family);
    return {
      address: signer.address,
      message,
      signature: await obtainSignature(signer, scope, (opts) => signer.signMessage(message, opts)),
    };
  }
}
