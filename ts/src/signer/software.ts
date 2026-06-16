/**
 * SoftwareSigner (L1) — in-process signing; no device, unattended-OK (plan §3 L1).
 * Family-aware because TRON and EVM serialize/sign differently.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import { privateKeyToAccount } from "viem/accounts";
import { TronWeb } from "tronweb";
import type { Bytes, ChainFamily, SignedTx, Signer, SignerSignOpts, UnsignedTx } from "../types/index.js";
import { ChainError } from "../errors/index.js";

export class SoftwareSigner implements Signer {
  readonly kind = "software" as const;
  #pkHex: `0x${string}`;
  #tron?: InstanceType<typeof TronWeb>;

  constructor(privateKey: Bytes, public readonly address: string, private readonly family: ChainFamily) {
    this.#pkHex = `0x${bytesToHex(privateKey)}`;
  }

  async sign(tx: UnsignedTx, _opts: SignerSignOpts): Promise<SignedTx> {
    if (this.family === "evm") {
      const account = privateKeyToAccount(this.#pkHex);
      return account.signTransaction(tx as any);
    }
    // TRON: sign the unsigned tx object (offline; no network call)
    return this.#tw().trx.sign(tx as any, this.#pkHex.slice(2));
  }

  async signMessage(message: string, _opts: SignerSignOpts): Promise<string> {
    if (this.family === "evm") {
      const account = privateKeyToAccount(this.#pkHex);
      return account.signMessage({ message });
    }
    try {
      return this.#tw().trx.signMessageV2(message, this.#pkHex.slice(2));
    } catch (e) {
      throw new ChainError("signing_rejected", `TRON message sign failed: ${(e as Error).message}`);
    }
  }

  #tw(): InstanceType<typeof TronWeb> {
    // throwaway instance for offline signing (no fullHost calls are made by sign)
    this.#tron ??= new TronWeb({ fullHost: "https://api.trongrid.io", privateKey: this.#pkHex.slice(2) });
    return this.#tron;
  }
}
