/**
 * SignerResolver (L2) — turn an AccountRef + family into a Signer carrying its cached
 * address. The wallet's source type decides software vs ledger — this is where "the active
 * wallet decides whether hardware confirmation is needed" lands (修正⑦). (plan §3 L2)
 */
import type { ChainFamily, Signer } from "../types/index.js";
import { Keystore, walletAddress } from "../keystore/index.js";
import { Ledger, LedgerSigner } from "../ledger/index.js";
import { SoftwareSigner } from "./software.js";
import { Derivation } from "../derivation/index.js";
import { WalletError } from "../errors/index.js";

export class SignerResolver {
  constructor(
    private readonly keystore: Keystore,
    private readonly ledger: Ledger,
  ) {}

  resolve(refOrLabel: string, family: ChainFamily): Signer {
    const { wallet, index } = this.keystore.resolveAccount(refOrLabel);
    const address = walletAddress(wallet, family, index);
    if (!address) throw new WalletError("missing_wallet_address", `account has no ${family} address`);

    switch (wallet.source.type) {
      case "privateKey":
        return new SoftwareSigner(this.keystore.decryptKey(wallet.source.keyId), address, family);
      case "seed": {
        const seed = this.keystore.decryptSeed(wallet.source.vaultId);
        const kp = Derivation.derive(seed, Derivation.path(family, index));
        return new SoftwareSigner(kp.privateKey, address, family);
      }
      case "ledger":
        return new LedgerSigner(this.ledger, wallet.source.family, wallet.source.path, address);
      case "watch":
        throw new WalletError("watch_only_no_signer", "watch-only account cannot sign; import its secret to sign");
    }
  }
}
