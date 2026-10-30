import type { SignerResolver } from "../services/signer/index.js";
import type { SigningService } from "../services/signing/signing-service.js";
import { MessageSigner } from "../services/signing/message-signer.js";

export class MessageService {
  readonly #signer: MessageSigner;

  constructor(signers: SignerResolver, signing: SigningService) {
    this.#signer = new MessageSigner(signers, signing);
  }

  sign(...args: Parameters<MessageSigner["sign"]>) {
    return this.#signer.sign(...args);
  }
}
