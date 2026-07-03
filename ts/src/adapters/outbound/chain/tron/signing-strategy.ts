/**
 * TRON SignStrategy implementation — the concrete signing behavior SoftwareSigner
 * delegates to, so the signer itself is family-agnostic (no `if family === …`). Each strategy
 * lives where its SDK dep does (tronweb for TRON); the runner composes them into the per-family
 * ADAPTERS table. Adding a chain = one more strategy here.
 */
import { utils as tronUtils } from "tronweb"
import type { SignStrategy } from "../../../../domain/types/index.js";
import { ChainError } from "../../../../domain/errors/index.js"

// Offline signing via TronWeb's static utils — no TronWeb instance, no fullHost, no network.
// These are the same primitives the instance methods call internally:
// signTransaction == trx.sign (minus an owner_address pre-check), signMessage == trx.signMessageV2.
// signTransaction wants a bare hex key; signMessage wants the 0x-prefixed key.
export const tronSignStrategy: SignStrategy = {
  async sign(pkHex, tx) {
    return tronUtils.crypto.signTransaction(pkHex.slice(2), tx as any)
  },
  async signMessage(pkHex, message) {
    try {
      return tronUtils.message.signMessage(message, pkHex)
    } catch (e) {
      throw new ChainError("signing_rejected", `TRON message sign failed: ${(e as Error).message}`)
    }
  },
}
