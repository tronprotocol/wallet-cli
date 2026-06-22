/**
 * SoftwareSigner (L1) — in-process signing; no device, unattended-OK (plan §3 L1).
 * Family-agnostic: the per-family serialize/sign difference lives in the injected SignStrategy
 * (see runtime/signer/strategies.ts), so this class has no `if family` branch.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Bytes, SignedTx, Signer, SignerSignOpts, UnsignedTx } from "../../core/types/index.js";
import type { SignStrategy } from "../../core/family/index.js";

export class SoftwareSigner implements Signer {
  readonly kind = "software" as const;
  #pkHex: `0x${string}`;

  constructor(
    privateKey: Bytes,
    public readonly address: string,
    private readonly strategy: SignStrategy,
  ) {
    this.#pkHex = `0x${bytesToHex(privateKey)}`;
  }

  async sign(tx: UnsignedTx, _opts: SignerSignOpts): Promise<SignedTx> {
    return this.strategy.sign(this.#pkHex, tx);
  }

  async signMessage(message: string, _opts: SignerSignOpts): Promise<string> {
    return this.strategy.signMessage(this.#pkHex, message);
  }
}
