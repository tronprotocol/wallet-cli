import { bytesToHex } from "@noble/hashes/utils.js";
import { Derivation } from "../../domain/derivation/index.js";
import { familyOf, type ChainFamily } from "../../domain/family/index.js";
import { UsageError, WalletError } from "../../domain/errors/index.js";
import type { BackupWriter } from "../ports/backup-writer.js";
import type { LedgerDevice } from "../ports/ledger-device.js";
import type { WalletRepository } from "../ports/wallet-repository.js";

const mutationStatus = (created: boolean): "created" | "existing" =>
  created ? "created" : "existing";

export class WalletService {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly ledger: LedgerDevice,
    private readonly backups: BackupWriter,
  ) {}

  create(label?: string) {
    const mnemonic = Derivation.generateMnemonic(128);
    return this.importSecret(mnemonic, "seed", label);
  }

  importMnemonic(secret: string, label?: string) {
    return this.importSecret(secret, "seed", label);
  }

  importPrivateKey(secret: string, label?: string) {
    return this.importSecret(secret, "privateKey", label);
  }

  async importLedger(family: ChainFamily, path: string, label?: string) {
    const address = await this.ledger.getAddress(family, path, { display: false });
    const result = this.wallets.registerLedger({ family, path, address, label });
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }

  importWatch(addressInput: string, label?: string) {
    const address = addressInput.trim();
    const family = familyOf(address);
    if (!family) throw new UsageError("invalid_value", `unrecognised address format: ${address}`);
    const result = this.wallets.registerWatch({ family, address, label });
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }

  list() {
    return this.wallets.list();
  }

  use(account: string) {
    const result = this.wallets.setActive(account);
    return { previous: result.previous, ...this.wallets.describe(result.accountId) };
  }

  current() {
    const account = this.wallets.activeAccount();
    if (!account) throw new WalletError("missing_wallet_address", "no active account; import one first");
    return this.wallets.describe(account);
  }

  rename(account: string, label: string) {
    const result = this.wallets.rename(account, label);
    return { previousLabel: result.previousLabel, ...this.wallets.describe(result.accountId) };
  }

  changePassword(oldPassword: string, newPassword: string) {
    return this.wallets.changePassword(oldPassword, newPassword);
  }

  derive(seedId: string, index?: number, label?: string) {
    // --seed-id is strictly the seed id (wlt_…) — the HD group header in `list`. No labels, no
    // sub-account refs: labels/refs point at an account, and the seed (not an account) is the root.
    const id = seedId.trim();
    if (!/^wlt_[^.]+$/.test(id)) {
      throw new UsageError("invalid_value", `--seed-id takes a seed id (wlt_…), not '${seedId}'; copy it from the HD group header in \`list\``);
    }
    const wallet = this.wallets.resolveWallet(id);
    if (wallet.source.type !== "seed") {
      throw new UsageError("invalid_value", `${wallet.source.type} wallet is not HD; derive needs a seed wallet`);
    }
    const baseLabel = this.wallets.describe(`${wallet.id}.0`).label; // the wallet's name (index-0 label)
    const result = this.wallets.addAccount(wallet.id, index);
    if (label) {
      this.wallets.rename(result.accountId, label);
    } else if (result.created) {
      // auto-name new accounts <wallet-name>-<index> so they read as siblings under the same seed.
      const newIndex = Number(result.accountId.split(".")[1]);
      this.wallets.rename(result.accountId, `${baseLabel ?? "hd"}-${newIndex}`);
    }
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }

  describe(account: string) {
    return this.wallets.describe(account);
  }

  delete(account: string) {
    // `scope` ("account" | "wallet") tells the caller/renderer whether a single HD sub-account or
    // the whole wallet (incl. children + secret) was removed — a root ref cascades to "wallet".
    return this.wallets.delete(account);
  }

  backup(account: string, requestedPath?: string) {
    const descriptor = this.wallets.describe(account);
    const { wallet } = this.wallets.resolveAccount(account);
    const source = wallet.source;
    const metadata = {
      accountId: descriptor.accountId,
      type: source.type,
      addresses: descriptor.addresses,
    };

    let secretType: "mnemonic" | "privateKey";
    let passphraseSet = false;
    let payload: Record<string, unknown>;
    if (source.type === "seed") {
      const revealed = this.wallets.revealMnemonic(source.vaultId);
      passphraseSet = revealed.passphraseSet;
      secretType = "mnemonic";
      payload = { ...metadata, secretType, passphraseSet, mnemonic: revealed.mnemonic };
    } else if (source.type === "privateKey") {
      secretType = "privateKey";
      payload = {
        ...metadata,
        secretType,
        privateKey: bytesToHex(this.wallets.decryptKey(source.keyId)),
      };
    } else {
      throw new WalletError(
        "watch_only_no_signer",
        `${source.type} accounts hold no exportable secret`,
      );
    }

    const file = this.backups.write(descriptor.accountId, requestedPath, payload);
    return { ...descriptor, secretType, ...file };
  }

  private importSecret(secret: string, type: "seed" | "privateKey", label?: string) {
    const result = this.wallets.import({ secret, type, label });
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }
}
