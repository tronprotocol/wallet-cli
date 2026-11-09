import type { ChainFamily, Signer, SignStrategy } from "../../../domain/types/index.js";
import type { AccountStore } from "../../ports/account-store.js";
import type { LedgerDevice } from "../../ports/ledger-device.js";
import { walletAddress } from "../../../domain/wallet/index.js";
import { LedgerSigner } from "./ledger.js";
import { SoftwareSigner } from "./software.js";
import {
  derivationMismatchError,
  legacyDerivationError,
  resolveDerivation,
} from "../../../domain/wallet/derivation-match.js";
import { UsageError, WalletError } from "../../../domain/errors/index.js";
import { FAMILIES } from "../../../domain/family/index.js";

export class SignerResolver {
  constructor(
    private readonly keystore: Pick<
      AccountStore,
      "resolveAccount" | "describe" | "decryptSeed" | "decryptKey"
    >,
    private readonly ledger: LedgerDevice,
    private readonly signStrategies: Record<ChainFamily, SignStrategy>,
  ) {}

  // Checks public metadata only; transaction callers gate this on transactionRequiresSigner.
  assertCanSign(
    refOrLabel: string,
    family: ChainFamily,
    opts?: { requireSoftware?: boolean },
  ): void {
    const { wallet, index } = this.keystore.resolveAccount(refOrLabel, family);
    const address = walletAddress(wallet, family, index);
    if (!address) {
      throw new UsageError("family_mismatch", `account has no ${family} address`);
    }
    if (wallet.source.type === "watch") {
      throw new WalletError(
        "watch_only_no_signer",
        "watch-only account cannot sign; import its secret to sign",
      );
    }
    if (opts?.requireSoftware && wallet.source.type === "ledger") {
      throw new WalletError(
        "ledger_unsupported",
        `this transaction type cannot be signed by the Ledger ${FAMILIES[family].ledger?.app ?? family} app; use a software account`,
      );
    }
  }

  /** Preflight credentials before creating an external payment order. */
  prepare(refOrLabel: string, family: ChainFamily): void {
    this.assertCanSign(refOrLabel, family);
    const signer = this.resolve(refOrLabel, family);
    if (signer instanceof SoftwareSigner) signer.prepare();
  }

  resolve(refOrLabel: string, family: ChainFamily): Signer {
    const { wallet, index } = this.keystore.resolveAccount(refOrLabel, family);
    const address = walletAddress(wallet, family, index);
    if (!address) {
      throw new UsageError("family_mismatch", `account has no ${family} address`);
    }

    switch (wallet.source.type) {
      case "privateKey": {
        const { keyId } = wallet.source;
        return new SoftwareSigner(
          () => this.keystore.decryptKey(keyId),
          address,
          this.signStrategies[family],
        );
      }
      case "seed": {
        const { vaultId } = wallet.source;
        const ref = `${wallet.id}.${index}`;
        const label = this.keystore.describe(ref).label;
        const loadKey = () => {
          // Defer seed decryption and derivation checks until key access is required.
          const seed = this.keystore.decryptSeed(vaultId);
          const resolved = resolveDerivation(seed, family, index, address);
          if (!resolved) throw derivationMismatchError(family, ref);
          if (resolved.scheme === "legacy")
            throw legacyDerivationError(ref, resolved.path, "sign", { account: label });
          return resolved.keyPair.privateKey;
        };
        return new SoftwareSigner(loadKey, address, this.signStrategies[family]);
      }
      case "ledger":
        return new LedgerSigner(this.ledger, wallet.source.family, wallet.source.path, address);
      case "watch":
        throw new WalletError(
          "watch_only_no_signer",
          "watch-only account cannot sign; import its secret to sign",
        );
    }
  }
}
