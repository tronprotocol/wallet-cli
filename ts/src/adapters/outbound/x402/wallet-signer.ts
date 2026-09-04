import type { Signer } from "../../../domain/types/index.js";
import { normalizeTypedData } from "../../../domain/typed-data/index.js";
import type { SigningScope } from "../../../application/services/signing/obtain-signature.js";
import { obtainSignature } from "../../../application/services/signing/obtain-signature.js";

/** External-wallet bridge shared by the EVM and TRON x402 packages. */
export class WalletX402Signer {
  readonly address: string;

  constructor(
    private readonly signer: Signer,
    private readonly scope: SigningScope,
  ) {
    this.address = signer.address;
  }

  getAddress(): string {
    return this.address;
  }

  async signTypedData(args: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`> {
    const payload = normalizeTypedData(args);
    const result = await obtainSignature(this.signer, this.scope, (options) =>
      this.signer.signTypedData(payload, options),
    );
    return `0x${result.signature.replace(/^0x/, "")}`;
  }
}
