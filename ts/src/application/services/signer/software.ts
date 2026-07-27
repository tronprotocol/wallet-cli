/**
 * SoftwareSigner — in-process signing; no device and safe for unattended execution.
 * Family-agnostic: the per-family serialize/sign difference lives in the injected SignStrategy
 * through dependency injection, so this class has no `if family` branch.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Bytes, SignedTx, Signer, SignerSignOpts, SignStrategy, TypedDataPayload, TypedDataSignature, UnsignedTx } from "../../../domain/types/index.js";

export class SoftwareSigner implements Signer {
  readonly kind = "software" as const;
  #pkHex?: `0x${string}`;

  // The key is decrypted lazily on first sign: `address` is public metadata, so build/estimate
  // (and hence `tx send --dry-run`) never touch the keystore — only an actual sign demands the password.
  constructor(
    private readonly loadKey: () => Bytes,
    public readonly address: string,
    private readonly strategy: SignStrategy,
  ) {}

  #pk(): `0x${string}` {
    return (this.#pkHex ??= `0x${bytesToHex(this.loadKey())}`);
  }

  async sign(tx: UnsignedTx, _opts: SignerSignOpts): Promise<SignedTx> {
    return this.strategy.sign(this.#pk(), tx);
  }

  async signMessage(message: string, _opts: SignerSignOpts): Promise<string> {
    return this.strategy.signMessage(this.#pk(), message);
  }

  async signTypedData(payload: TypedDataPayload, _opts: SignerSignOpts): Promise<TypedDataSignature> {
    return this.strategy.signTypedData(this.#pk(), payload);
  }
}
