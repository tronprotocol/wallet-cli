import type { AccountRef, ChainFamily } from "../../domain/types/index.js";
import type { SignerResolver } from "../services/signer/index.js";

export class MessageService {
  constructor(private readonly signers: SignerResolver) {}

  async sign(family: ChainFamily, account: AccountRef, message: string) {
    const signer = this.signers.resolve(account, family);
    return {
      address: signer.address,
      message,
      signature: await signer.signMessage(message, {}),
    };
  }
}

