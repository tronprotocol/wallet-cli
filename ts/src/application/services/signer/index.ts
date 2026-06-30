/**
 * SignerResolver — turn an AccountRef + family into a Signer carrying its cached
 * address. The wallet's source type decides software vs ledger — this is where "the active
 * wallet decides whether hardware confirmation is needed" lands.
 */
import type { ChainFamily, Signer, SignStrategy } from "../../../domain/types/index.js";
import type { AccountStore } from "../../ports/account-store.js";
import type { LedgerDevice } from "../../ports/ledger-device.js";
import { walletAddress } from "../../../domain/wallet/index.js";
import { LedgerSigner } from "./ledger.js";
import { SoftwareSigner } from "./software.js";
import { Derivation } from "../../../domain/derivation/index.js";
import { WalletError } from "../../../domain/errors/index.js";

export class SignerResolver {
  constructor(
    private readonly keystore: Pick<AccountStore, "resolveAccount" | "decryptSeed" | "decryptKey">,
    private readonly ledger: LedgerDevice,
    private readonly signStrategies: Record<ChainFamily, SignStrategy>,
  ) {}

  resolve(refOrLabel: string, family: ChainFamily): Signer {
    const { wallet, index } = this.keystore.resolveAccount(refOrLabel);
    const address = walletAddress(wallet, family, index);
    if (!address) throw new WalletError("missing_wallet_address", `account has no ${family} address`);

    switch (wallet.source.type) {
      case "privateKey": {
        const { keyId } = wallet.source;
        return new SoftwareSigner(() => this.keystore.decryptKey(keyId), address, this.signStrategies[family]);
      }
      case "seed": {
        const { vaultId } = wallet.source;
        const loadKey = () => Derivation.derive(this.keystore.decryptSeed(vaultId), Derivation.path(family, index)).privateKey;
        return new SoftwareSigner(loadKey, address, this.signStrategies[family]);
      }
      case "ledger":
        return new LedgerSigner(this.ledger, wallet.source.family, wallet.source.path, address);
      case "watch":
        throw new WalletError("watch_only_no_signer", "watch-only account cannot sign; import its secret to sign");
    }
  }
}
