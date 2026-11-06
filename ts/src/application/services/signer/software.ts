import { bytesToHex } from "@noble/hashes/utils.js";
import type {
  Bytes,
  SignedTx,
  Signer,
  SignerSignOpts,
  SignStrategy,
  TypedDataPayload,
  TypedDataSignature,
  UnsignedTx,
} from "../../../domain/types/index.js";

export class SoftwareSigner implements Signer {
  readonly kind = "software" as const;
  #pkHex?: `0x${string}`;

  // Construction uses public metadata; prepare or signing loads the key.
  constructor(
    private readonly loadKey: () => Bytes,
    public readonly address: string,
    private readonly strategy: SignStrategy,
  ) {}

  /** Validate local key access without signing or broadcasting. */
  prepare(): void {
    this.loadKey();
  }

  #pk(): `0x${string}` {
    return (this.#pkHex ??= `0x${bytesToHex(this.loadKey())}`);
  }

  async sign(tx: UnsignedTx, _opts: SignerSignOpts): Promise<SignedTx> {
    return this.strategy.sign(this.#pk(), tx);
  }

  async signMessage(message: string, _opts: SignerSignOpts): Promise<string> {
    return this.strategy.signMessage(this.#pk(), message);
  }

  async signTypedData(
    payload: TypedDataPayload,
    _opts: SignerSignOpts,
  ): Promise<TypedDataSignature> {
    return this.strategy.signTypedData(this.#pk(), payload);
  }
}
