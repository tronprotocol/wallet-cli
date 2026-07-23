import type { AccountRef, ChainFamily } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { SignerResolver } from "../services/signer/index.js";
import { obtainSignature } from "../services/signing/obtain-signature.js";

export class MessageService {
  constructor(private readonly signers: SignerResolver) {}

  async sign(scope: TransactionScope, family: ChainFamily, account: AccountRef, message: string) {
    const signer = this.signers.resolve(account, family);
    // obtainSignature handles the device preliminaries: verify the connected device still derives
    // this account's cached address (wrong seed/passphrase → wrong_device_seed) before attributing
    // a signature to it, prompt the user to approve on-device, and bound a prompt that is never
    // tapped. Software signers pass straight through. Same path as the transaction pipeline.
    return {
      address: signer.address,
      message,
      signature: await obtainSignature(signer, scope, (opts) => signer.signMessage(message, opts)),
    };
  }
}
