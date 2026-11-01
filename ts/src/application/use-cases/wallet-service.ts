import type { ExecutionDeadline } from "../contracts/deadline.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Derivation } from "../../domain/derivation/index.js";
import {
  derivationMismatchError,
  LEGACY_DERIVATION_RECOVERY_GUIDE,
  legacyAccounts,
  resolveDerivation,
} from "../../domain/wallet/derivation-match.js";
import { walletAddress } from "../../domain/wallet/index.js";
import { assertPasswordPolicy } from "../../domain/wallet/password-policy.js";
import {
  addressCodec,
  CHAIN_FAMILIES,
  canonicalAddress,
  familyOf,
  tronHexAddress,
  type ChainFamily,
} from "../../domain/family/index.js";
import { resembledFamily } from "../../domain/contact/index.js";
import { KeystoreV3 } from "../../domain/keystore/index.js";
import type {
  AccountDescriptor,
  AccountSelector,
  Bytes,
  WarningView,
} from "../../domain/types/index.js";
import {
  errorMessage,
  ExecutionError,
  followUp,
  inputRef,
  UsageError,
  WalletError,
  type UserMessage,
} from "../../domain/errors/index.js";
import type { BackupWriter } from "../ports/backup-writer.js";
import type { BackupRecord, BackupRecordStore } from "../ports/backup-records.js";
import type { LedgerDevice } from "../ports/ledger-device.js";
import type { WalletRepository } from "../ports/wallet-repository.js";
import { AccountSelection } from "../services/account-selection.js";

const mutationStatus = (created: boolean): "created" | "existing" =>
  created ? "created" : "existing";

// Cached addresses cannot establish derivation paths without decrypting the seed.
const withoutDerivationPath = <T extends AccountDescriptor>(
  descriptor: T,
): Omit<T, "derivationPath"> & { derivationPath: null } => ({
  ...descriptor,
  derivationPath: null,
});

const notExportable = (type: string) =>
  new WalletError("not_exportable", `${type} accounts hold no exportable secret`);

// Preferred record identity for native backups covering every family.
const RECORD_IDENTITY_FAMILY: ChainFamily = "tron";

export const SECRET_FILE_NOT_REMOVED_WARNING = "secret_file_not_removed";

export interface BackupRecordQuery {
  // Inclusive UTC ISO-8601 bounds; caller parses and validates both.
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  /** accountId / label / address of the account whose exports to show. */
  account?: string;
}

export interface DeriveRequest {
  /** Explicit seed selection takes precedence over account and active-account selection. */
  seedId?: string;
  /** Any account belonging to an HD wallet identifies that wallet. */
  account?: string;
  index?: number;
  label?: string;
}

export class WalletService {
  readonly #selection: AccountSelection;

  constructor(
    private readonly wallets: WalletRepository,
    private readonly ledger: LedgerDevice,
    private readonly backups: BackupWriter,
    private readonly backupRecordStore: BackupRecordStore,
    private readonly now: () => number = Date.now,
  ) {
    this.#selection = new AccountSelection(wallets);
  }

  // The account a command acts on: the requested one, else the active one.
  selectAccount(requested?: string): AccountSelector {
    return this.#selection.select(requested);
  }

  accountAddress(account: AccountSelector, family: ChainFamily): string {
    return this.#selection.address(account, family);
  }

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

  async importLedger(
    deadline: ExecutionDeadline,
    family: ChainFamily,
    path: string,
    label?: string,
  ) {
    const address = await this.ledger.getAddress(family, path, {
      display: false,
      signal: deadline.signal,
    });
    const result = this.wallets.registerLedger({ family, path, address, label });
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }

  importWatch(addressInput: string, label?: string) {
    const input = addressInput.trim();
    const family = familyOf(input);
    if (!family) {
      throw new UsageError("invalid_address", addressRejection(input));
    }
    const address = canonicalAddress(input);
    const result = this.wallets.registerWatch({ family, address, label });
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }

  list() {
    return this.wallets.list().map(withoutDerivationPath);
  }

  unreadableWallets() {
    return this.wallets.unreadable();
  }

  use(account: string) {
    const result = this.wallets.setActive(account);
    return withoutDerivationPath({
      previous: result.previous,
      ...this.wallets.describe(result.accountId),
    });
  }

  current(requestedAccount?: string) {
    const account = this.#selection.select(
      requestedAccount,
      errorMessage`no active account; import one first`,
    );
    return withoutDerivationPath(this.wallets.describe(account));
  }

  rename(account: string, label: string) {
    const result = this.wallets.rename(account, label);
    return withoutDerivationPath({
      previousLabel: result.previousLabel,
      ...this.wallets.describe(result.accountId),
    });
  }

  changePassword(oldPassword: string, newPassword: string) {
    assertPasswordPolicy(newPassword);
    return this.wallets.changePassword(oldPassword, newPassword);
  }

  derive(request: DeriveRequest, warn?: (message: string) => void) {
    const wallet = (() => {
      // Explicit seed selection must work even if the account override is stale.
      if (request.seedId !== undefined) {
        const id = request.seedId.trim();
        if (!/^wlt_[^.]+$/.test(id)) {
          throw new UsageError(
            "invalid_value",
            errorMessage`${inputRef("seedId")} takes a seed id (wlt_…), not '${request.seedId}'; copy it from the HD group header in \`${followUp("account-list")}\``,
          );
        }
        return this.wallets.resolveWallet(id);
      }

      const account = this.#selection.select(
        request.account,
        errorMessage`no active account; select an HD account with ${inputRef("account")} or pass ${inputRef("seedId")}`,
      );
      return this.wallets.resolveAccount(account).wallet;
    })();

    if (wallet.source.type !== "seed") {
      throw new UsageError(
        "seed_not_found",
        request.seedId !== undefined
          ? errorMessage`${wallet.source.type} wallet is not HD; ${inputRef("seedId")} must name an HD seed wallet`
          : errorMessage`${wallet.source.type} account is not HD; select an account belonging to an HD wallet or pass ${inputRef("seedId")} <wlt_…>`,
      );
    }
    const result = this.wallets.addAccount(wallet.id, request.index, request.label);
    const descriptor = this.#describeWithVerifiedDerivation(result.accountId);
    const tronPath = descriptor.derivationPath?.tron;
    if (
      !result.created &&
      descriptor.index !== null &&
      tronPath !== undefined &&
      Derivation.legacyPaths("tron", descriptor.index).includes(tronPath)
    ) {
      warn?.(
        `existing account ${JSON.stringify(descriptor.label ?? descriptor.accountId)} uses legacy TRON path ${tronPath}. ` +
          `The wallet's recovery phrase can still derive this key at that path, but this version's default mnemonic recovery will not recreate its TRON address. ` +
          `Follow ${LEGACY_DERIVATION_RECOVERY_GUIDE}`,
      );
    }
    return {
      status: mutationStatus(result.created),
      ...descriptor,
    };
  }

  describe(account: string) {
    return this.wallets.describe(account);
  }

  // Without decrypting the seed, deletion cannot verify the cached addresses’ derivation paths.
  deletionWarning(account: string): string | undefined {
    const { wallet } = this.wallets.resolveAccount(account);
    if (
      wallet.source.type !== "seed" ||
      !Object.entries(wallet.source.addresses).some(
        ([index, addresses]) => Number(index) > 0 && addresses.tron,
      )
    )
      return;
    return (
      "This HD wallet contains TRON sub-accounts. If created with an older derivation path, default mnemonic recovery may not recreate them. Back up and verify their keys before deleting. " +
      LEGACY_DERIVATION_RECOVERY_GUIDE
    );
  }

  delete(account: string, warn: (warning: WarningView) => void) {
    const { retainedSecretFile, ...result } = this.wallets.delete(account);
    if (retainedSecretFile !== undefined) {
      warn({
        code: SECRET_FILE_NOT_REMOVED_WARNING,
        message: `the account was deleted, but its encrypted secret file could not be removed: ${retainedSecretFile}; delete that file yourself`,
      });
    }
    return result;
  }

  verifyPassword(password: string) {
    return this.wallets.verifyPassword(password);
  }

  // Check before prompting: Ledger/watch accounts may have no master-password sentinel.
  assertExportable(account: string) {
    const { type } = this.wallets.resolveAccount(account).wallet.source;
    if (type !== "seed" && type !== "privateKey") throw notExportable(type);
  }

  /** `warn` names accounts that this version's default mnemonic recovery will not rediscover. */
  backup(account: string, requestedPath?: string, warn?: (message: UserMessage) => void) {
    const { wallet } = this.wallets.resolveAccount(account);
    const source = wallet.source;
    const seed = source.type === "seed" ? this.wallets.decryptSeed(source.vaultId) : undefined;
    const descriptor = this.#describeWithVerifiedDerivation(account, seed);
    const metadata = {
      accountId: descriptor.accountId,
      type: source.type,
      addresses: descriptor.addresses,
    };

    let secretType: "mnemonic" | "privateKey";
    let passphraseSet: boolean;
    let payload: Record<string, unknown>;
    if (source.type === "seed") {
      const revealed = this.wallets.revealMnemonic(source.vaultId);
      passphraseSet = revealed.passphraseSet;
      secretType = "mnemonic";
      payload = { ...metadata, secretType, passphraseSet, mnemonic: revealed.mnemonic };
      // A mnemonic covers the whole seed; check every account’s recovery path.
      const stranded = legacyAccounts(seed!, source.addresses);
      if (stranded.length > 0 && warn) {
        const one = stranded.length === 1;
        const steps = stranded
          .map((a) => errorMessage`  ${followUp("keystore-backup", `${wallet.id}.${a.index}`)}`)
          .reduce((all, step) => errorMessage`${all}\n${step}`);
        warn(
          errorMessage`this version's default mnemonic recovery will NOT recreate ${stranded
            .map((a) => `${wallet.id}.${a.index} (${a.path})`)
            .join(
              ", ",
            )} — ${one ? "that account was" : "those accounts were"} derived at a TRON path this version no longer produces, but the recovery phrase can still derive ${one ? "that key" : "those keys"} at the listed ${one ? "path" : "paths"}. Export ${one ? "it" : "each"} separately before deleting anything:\n${steps}\nFollow ${LEGACY_DERIVATION_RECOVERY_GUIDE}`,
        );
      }
    } else if (source.type === "privateKey") {
      secretType = "privateKey";
      payload = {
        ...metadata,
        secretType,
        privateKey: bytesToHex(this.wallets.decryptKey(source.keyId)),
      };
    } else {
      throw notExportable(source.type);
    }

    const file = this.backups.write(descriptor.accountId, requestedPath, payload, "native");
    // Native backups cover every family, including raw private-key backups.
    this.#recordExport("native-export", descriptor, file.out);
    return { ...descriptor, secretType, format: "native" as const, ...file };
  }

  // Encrypts one account’s private key with the master password; does not export the seed.
  // Family selects an HD key; private-key accounts share one key across families.
  backupKeystore(
    account: string,
    requestedPath: string | undefined,
    masterPassword: string,
    family: ChainFamily,
  ) {
    const { wallet } = this.wallets.resolveAccount(account);
    const seed =
      wallet.source.type === "seed" ? this.wallets.decryptSeed(wallet.source.vaultId) : undefined;
    const descriptor = this.#describeWithVerifiedDerivation(account, seed);
    const privateKey = this.#exportablePrivateKey(account, family, seed);
    const file = this.backups.write(
      descriptor.accountId,
      requestedPath,
      KeystoreV3.encrypt(privateKey, masterPassword, keystoreAddress(family, privateKey)),
      "keystore",
    );
    this.#recordExport("keystore-export", descriptor, file.out, family);
    return {
      ...descriptor,
      family,
      secretType: "privateKey" as const,
      format: "keystore" as const,
      ...file,
    };
  }

  importKeystore(file: unknown, keystorePassword: string, label?: string) {
    const privateKey = KeystoreV3.decrypt(file, keystorePassword);
    // Reject invalid scalars before address derivation can throw an unclassified error.
    if (!Derivation.isValidPrivateKey(privateKey))
      throw new WalletError("invalid_private_key", "private key is out of range for secp256k1");
    return this.importSecret(bytesToHex(privateKey), "privateKey", label);
  }

  // Password-free export metadata, newest first.
  backupRecords(query: BackupRecordQuery = {}) {
    const offset = query.offset ?? 0;
    const target = query.account === undefined ? undefined : this.wallets.describe(query.account);
    const matched = this.backupRecordStore.list().filter((r) => {
      if (query.from !== undefined && r.timestamp < query.from) return false;
      if (query.to !== undefined && r.timestamp > query.to) return false;
      // Match IDs after rename or any family’s address after reimport.
      if (
        target &&
        r.accountId !== target.accountId &&
        !CHAIN_FAMILIES.some(
          (f) => target.addresses[f] !== undefined && r.account === target.addresses[f],
        )
      )
        return false;
      return true;
    });
    const records = matched.slice(
      offset,
      query.limit === undefined ? undefined : offset + query.limit,
    );
    return {
      records,
      pagination: { offset, limit: query.limit ?? null, total: matched.length },
    };
  }

  isInitialized() {
    return this.wallets.isInitialized();
  }

  // Verify paths against cached addresses; never substitute an unverified derivation template.
  #describeWithVerifiedDerivation(account: string, knownSeed?: Bytes): AccountDescriptor {
    const descriptor = this.wallets.describe(account);
    const { wallet, index } = this.wallets.resolveAccount(account);
    if (wallet.source.type !== "seed") return descriptor;

    const seed = knownSeed ?? this.wallets.decryptSeed(wallet.source.vaultId);
    const derivationPath: Record<string, string> = {};
    for (const family of CHAIN_FAMILIES) {
      const address = walletAddress(wallet, family, index);
      if (!address) continue;
      const resolved = resolveDerivation(seed, family, index, address);
      if (!resolved) throw derivationMismatchError(family, descriptor.accountId);
      derivationPath[family] = resolved.path;
    }
    return { ...descriptor, derivationPath };
  }

  // Export the key matching the stored address, including a legacy derivation path.
  #exportablePrivateKey(account: string, family: ChainFamily, knownSeed?: Bytes): Bytes {
    const { wallet, index } = this.wallets.resolveAccount(account);
    const source = wallet.source;
    if (source.type === "privateKey") return this.wallets.decryptKey(source.keyId);
    if (source.type === "seed") {
      const address = walletAddress(wallet, family, index);
      if (!address) throw new UsageError("family_mismatch", `account has no ${family} address`);
      const seed = knownSeed ?? this.wallets.decryptSeed(source.vaultId);
      const resolved = resolveDerivation(seed, family, index, address);
      if (!resolved) throw derivationMismatchError(family, account);
      return resolved.keyPair.privateKey;
    }
    throw notExportable(source.type);
  }

  // Record only completed writes; if logging fails, retain the path to the exported secret.
  #recordExport(
    operation: BackupRecord["operation"],
    descriptor: {
      accountId: string;
      label?: string | null;
      addresses: Partial<Record<ChainFamily, string>>;
    },
    out: string,
    family?: ChainFamily,
  ) {
    try {
      this.#appendExport(operation, descriptor, out, family);
    } catch (error) {
      throw new ExecutionError(
        "audit_append_failed",
        `the ${operation === "native-export" ? "backup" : "keystore"} file was written to ${out}, but recording it in the export log failed: ${(error as Error).message}`,
        { out, fileMode: "0600" },
      );
    }
  }

  #appendExport(
    operation: BackupRecord["operation"],
    descriptor: {
      accountId: string;
      label?: string | null;
      addresses: Partial<Record<ChainFamily, string>>;
    },
    out: string,
    family?: ChainFamily,
  ) {
    // Record the exported family’s address; native backups use a representative wallet address.
    const address =
      (family === undefined ? undefined : descriptor.addresses[family]) ??
      descriptor.addresses[RECORD_IDENTITY_FAMILY] ??
      CHAIN_FAMILIES.map((f) => descriptor.addresses[f]).find((a) => a !== undefined) ??
      "";
    this.backupRecordStore.append({
      operation,
      accountId: descriptor.accountId,
      account: address,
      ...(family === undefined ? {} : { family }),
      label: descriptor.label ?? null,
      out,
      timestamp: new Date(this.now()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
  }

  private importSecret(secret: string, type: "seed" | "privateKey", label?: string) {
    const result = this.wallets.import({ secret, type, label });
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }
}

// Informational address: TRON uses 41-prefixed hex; EVM uses 0x-prefixed hex.
function keystoreAddress(family: ChainFamily, privateKey: Bytes): string {
  const publicKey = Derivation.publicKeyFromPrivate(privateKey);
  const address = addressCodec(family).fromPublicKey(publicKey);
  return family === "tron" ? tronHexAddress(address) : address;
}

function addressRejection(value: string): string {
  const resembles = resembledFamily(value);
  return resembles
    ? `${value} looks like a ${resembles} address but its length or checksum is wrong`
    : `unrecognised address format: ${value}`;
}
