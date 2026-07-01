import type { AccountRef, ChainFamily } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { SignerResolver } from "../services/signer/index.js";

export class MessageService {
  constructor(private readonly signers: SignerResolver) {}

  async sign(scope: TransactionScope, family: ChainFamily, account: AccountRef, message: string) {
    const signer = this.signers.resolve(account, family);
    // Device signers: verify the connected device still derives this account's cached address
    // (wrong seed/passphrase → wrong_device_seed) before attributing a signature to it, and
    // tell the user to approve the on-device prompt. Mirrors the transaction pipeline.
    if (signer.kind === "device") {
      await signer.precheck?.();
      scope.emit({ type: "awaiting_device", reason: "sign" });
    }
    return {
      address: signer.address,
      message,
      signature: await signer.signMessage(message, {}),
    };
  }
}

