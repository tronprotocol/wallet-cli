/**
 * Per-family SignStrategy implementations (L1) — the concrete signing behaviour SoftwareSigner
 * delegates to, so the signer itself is family-agnostic (no `if family === …`). Each strategy
 * lives where its SDK dep does (viem for EVM, tronweb for TRON); the runner composes them into
 * the per-family ADAPTERS table (plan §7.12.1). Adding a chain = one more strategy here.
 */
import { privateKeyToAccount } from "viem/accounts";
import { TronWeb } from "tronweb";
import type { SignStrategy } from "../../core/family/index.js";
import { ChainError } from "../../core/errors/index.js";

const asHex = (pkHex: string) => pkHex as `0x${string}`;

export const evmSignStrategy: SignStrategy = {
  async sign(pkHex, tx) {
    return privateKeyToAccount(asHex(pkHex)).signTransaction(tx as any);
  },
  async signMessage(pkHex, message) {
    return privateKeyToAccount(asHex(pkHex)).signMessage({ message });
  },
};

// One shared throwaway TronWeb for offline signing; sign/signMessageV2 take the key explicitly,
// so no per-key instance and no network call is made.
let tron: InstanceType<typeof TronWeb> | undefined;
function tw(): InstanceType<typeof TronWeb> {
  tron ??= new TronWeb({ fullHost: "https://api.trongrid.io" });
  return tron;
}

export const tronSignStrategy: SignStrategy = {
  async sign(pkHex, tx) {
    return tw().trx.sign(tx as any, pkHex.slice(2));
  },
  async signMessage(pkHex, message) {
    try {
      return tw().trx.signMessageV2(message, pkHex.slice(2));
    } catch (e) {
      throw new ChainError("signing_rejected", `TRON message sign failed: ${(e as Error).message}`);
    }
  },
};
