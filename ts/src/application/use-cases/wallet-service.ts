import { bytesToHex } from "@noble/hashes/utils.js";
import { Derivation } from "../../domain/derivation/index.js";
import {
  derivationMismatchError,
  legacyAccounts,
  resolveDerivation,
} from "../../domain/wallet/derivation-match.js";
import { walletAddress } from "../../domain/wallet/index.js";
import {
  CHAIN_FAMILIES,
  canonicalAddress,
  familyOf,
  type ChainFamily,
} from "../../domain/family/index.js";
import { resembledFamily } from "../../domain/contact/index.js";
import { KeystoreV3 } from "../../domain/keystore/index.js";
import {
  TronAddress,
  evmAddressFromPublicKey,
  tronHexAddress,
} from "../../domain/address/index.js";
import type { AccountDescriptor, Bytes } from "../../domain/types/index.js";
import { ExecutionError, UsageError, WalletError } from "../../domain/errors/index.js";
import type { BackupWriter } from "../ports/backup-writer.js";
import type { BackupRecord, BackupRecordStore } from "../ports/backup-records.js";
import type { LedgerDevice } from "../ports/ledger-device.js";
import type { WalletRepository } from "../ports/wallet-repository.js";

const mutationStatus = (created: boolean): "created" | "existing" =>
  created ? "created" : "existing";

/**
 * Password-free account commands deliberately do not make derivation claims. Their interface is
 * account selection/identity, not key derivation, and an old TRON account cannot be distinguished
 * from a corrected one without opening its seed. Keep that policy at the use-case seam so
 * list/current/use/rename cannot drift apart.
 */
const withoutDerivationPath = <T extends AccountDescriptor>(
  descriptor: T,
): Omit<T, "derivationPath"> & { derivationPath: null } => ({
  ...descriptor,
  derivationPath: null,
});

const notExportable = (type: string) =>
  new WalletError("not_exportable", `${type} accounts hold no exportable secret`);

/** A keystore file is single-key and TRON-shaped: its `address` is the TRON form, and an HD account
 *  exports the key at its own TRON derivation path. (EVM lands as its own export when it lands.) */
/** the address a record is filed under when the export covered EVERY family (native backup):
 *  one stable identity is needed, and TRON's is the one this log has always used. */
const RECORD_IDENTITY_FAMILY: ChainFamily = "tron";

export interface BackupRecordQuery {
  /** inclusive bounds as UTC ISO-8601 instants; parsed and validated by the caller. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  /** accountId / label / address of the account whose exports to show. */
  account?: string;
}

export class WalletService {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly ledger: LedgerDevice,
    private readonly backups: BackupWriter,
    private readonly backupRecordStore: BackupRecordStore,
    private readonly now: () => number = Date.now,
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
    const input = addressInput.trim();
    const family = familyOf(input);
    if (!family) {
      throw new UsageError("invalid_address", addressRejection(input));
    }
    // Stored in the spelling it will be printed in, so this account never displays
    // differently from the same address reached through any other command.
    const address = canonicalAddress(input);
    const result = this.wallets.registerWatch({ family, address, label });
    return { status: mutationStatus(result.created), ...this.wallets.describe(result.accountId) };
  }

  list() {
    return this.wallets.list().map(withoutDerivationPath);
  }

  /** ids of wallets skipped by list() because this build does not know their source kind. */
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
    const account = requestedAccount ?? this.wallets.activeAccount();
    if (!account)
      throw new WalletError("missing_wallet_address", "no active account; import one first");
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
    return this.wallets.changePassword(oldPassword, newPassword);
  }

  derive(seedId: string, index?: number, label?: string) {
    // --seed-id is strictly the seed id (wlt_…) — the HD group header in `list`. No labels, no
    // sub-account refs: labels/refs point at an account, and the seed (not an account) is the root.
    const id = seedId.trim();
    if (!/^wlt_[^.]+$/.test(id)) {
      throw new UsageError(
        "invalid_value",
        `--seed-id takes a seed id (wlt_…), not '${seedId}'; copy it from the HD group header in \`list\``,
      );
    }
    const wallet = this.wallets.resolveWallet(id);
    if (wallet.source.type !== "seed") {
      // Its own code, for the same reason `account_not_found` has one: "that reference is not a
      // seed wallet" has an obvious next step (`list`, and read the HD group headers), and an
      // agent can only take it if the code says so rather than the English.
      throw new UsageError(
        "seed_not_found",
        `${wallet.source.type} wallet is not HD; derive needs a seed wallet`,
      );
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
    return {
      status: mutationStatus(result.created),
      ...this.#describeWithVerifiedDerivation(result.accountId),
    };
  }

  describe(account: string) {
    return this.wallets.describe(account);
  }

  delete(account: string) {
    // `scope` ("account" | "wallet") tells the caller/renderer whether a single HD sub-account or
    // the whole wallet (incl. children + secret) was removed — a root ref cascades to "wallet".
    return this.wallets.delete(account);
  }

  verifyPassword(password: string) {
    return this.wallets.verifyPassword(password);
  }

  /** Ledger / watch accounts hold no exportable secret. Callers check this BEFORE the master-password
   *  gate: a Ledger-only keystore may have no password sentinel at all, and verifying against a
   *  missing sentinel can never succeed — the user would face a prompt no answer satisfies. */
  assertExportable(account: string) {
    const { type } = this.wallets.resolveAccount(account).wallet.source;
    if (type !== "seed" && type !== "privateKey") throw notExportable(type);
  }

  /**
   * `warn` reports the accounts this backup does NOT cover. A mnemonic re-derives on the current
   * template everywhere, so an account still on the old TRON path is missing from its own
   * wallet's backup — and `delete` then `import mnemonic` is a documented recovery route, which
   * is how a silent export turns into a lost account.
   */
  backup(account: string, requestedPath?: string, warn?: (message: string) => void) {
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
      // The whole wallet, not the account named on the command line: one mnemonic is every
      // account of its seed, so the gap is the same whichever one was asked for.
      const stranded = legacyAccounts(seed!, source.addresses);
      if (stranded.length > 0 && warn) {
        warn(
          `this recovery phrase does NOT back up ${stranded
            .map((a) => `${wallet.id}.${a.index} (${a.path})`)
            .join(", ")} — ` +
            `${stranded.length === 1 ? "that account was" : "those accounts were"} derived at a TRON path this version no longer produces, ` +
            `and the phrase re-derives the current one in every wallet, this one included. ` +
            `Export ${stranded.length === 1 ? "it" : "each"} separately before relying on this file:\n` +
            stranded
              .map(
                (a) =>
                  `  wallet-cli backup ${wallet.id}.${a.index} --keystore --network tron:728126428 --password-stdin`,
              )
              .join("\n"),
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
    // No family: a mnemonic — and equally a raw private key — is every family's key at once.
    this.#recordExport("backup", descriptor, file.out);
    return { ...descriptor, secretType, format: "native" as const, ...file };
  }

  /**
   * Export ONE account as a standard Web3 V3 keystore, encrypted with the master password.
   *
   * A keystore holds a single private key: an HD account exports only the key at its current index,
   * so the file is an isolated account elsewhere and nothing can be derived from it. Moving a whole
   * seed is what the native `backup` (mnemonic) is for.
   */
  /**
   * `family` selects WHICH key: a seed account holds a different one per family (derivation puts
   * TRON at coin 195 and EVM at coin 60), and a V3 keystore holds exactly one. The caller passes
   * the selected network's family; a privateKey account has only one key and ignores it.
   */
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
    this.#recordExport("backup --keystore", descriptor, file.out, family);
    return {
      ...descriptor,
      family,
      secretType: "privateKey" as const,
      format: "keystore" as const,
      ...file,
    };
  }

  /**
   * Import the single private key held in a parsed V3 keystore, re-encrypted under the master
   * password and made active.
   *
   * A V3 keystore is a private key wrapped in an encrypted file; what lands in the wallet is
   * exactly what `import private-key` stores — a `privateKey` source. The two commands differ
   * only in how the key arrives (file + password vs. a raw string on the secret channel), never
   * in what it becomes, so this delegates to the same `importSecret` path and inherits the same
   * dedup/clash behavior: idempotent against an existing `privateKey` account holding this key,
   * a new sibling account against an existing `seed`/`watch`/Ledger account at the same address.
   * ADR-0007's promise not to overwrite a same-address account still holds — more strongly than
   * before, since there is no longer an overwrite path here to refuse in the first place
   * (ADR-0011).
   */
  importKeystore(file: unknown, keystorePassword: string, label?: string) {
    const privateKey = KeystoreV3.decrypt(file, keystorePassword);
    // Same reasoning as the raw-private-key import path (adapters/outbound/keystore): a scalar
    // outside secp256k1's valid range would otherwise blow up inside derivePrivAddresses(), where
    // classifyError redacts it to internal_error instead of the actionable invalid_private_key.
    if (!Derivation.isValidPrivateKey(privateKey))
      throw new WalletError("invalid_private_key", "private key is out of range for secp256k1");
    return this.importSecret(bytesToHex(privateKey), "privateKey", label);
  }

  /** The local export audit log, newest first. Read-only and password-free — it holds no secrets. */
  backupRecords(query: BackupRecordQuery = {}) {
    const offset = query.offset ?? 0;
    const target = query.account === undefined ? undefined : this.wallets.describe(query.account);
    const matched = this.backupRecordStore.list().filter((r) => {
      if (query.from !== undefined && r.timestamp < query.from) return false;
      if (query.to !== undefined && r.timestamp > query.to) return false;
      // Records are snapshots, so an account is matched by either identity it was logged under —
      // a since-renamed account still matches on accountId, a re-imported one on its address.
      // Any of the target's addresses, not just its TRON one: a keystore export is filed under
      // the family it exported, so filtering on one family would hide the other family's exports
      // of the very account being asked about.
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

  /**
   * A descriptor for a command that has opened the seed and can therefore state the path behind
   * every cached address. This is intentionally separate from the password-free account views:
   * a missing match is corruption/vault disagreement, never permission to print the current
   * template as though it were an observed fact.
   */
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

  /**
   * The private key a backup may hand out.
   *
   * For a seed account the template is resolved against the stored address rather than assumed:
   * an account derived before the TRON path correction still owns its old address, and exporting
   * the current template's key would give the user an empty account — while the refusal message
   * tells them to run exactly this command. This is deliberately the only place that will use a
   * template the CLI no longer produces, and only so the key can leave.
   */
  #exportablePrivateKey(account: string, family: ChainFamily, knownSeed?: Bytes): Bytes {
    const { wallet, index } = this.wallets.resolveAccount(account);
    const source = wallet.source;
    // One key, shared by every family — nothing to choose.
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

  /**
   * Appended only after the file exists, so the audit log never claims a failed export.
   * Timestamps are UTC at second precision — an audit trail, not a profiler.
   *
   * The secret is already on disk by the time this runs, so a failure here is not a clean one: the
   * export did not fully succeed, but something sensitive exists that the caller must be able to
   * find and shred. Without `--out` that is a timestamped file in the process's working directory,
   * which nobody can guess — so the path travels with the error rather than being lost with it.
   */
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
        `the ${operation === "backup" ? "backup" : "keystore"} file was written to ${out}, but recording it in the export log failed: ${(error as Error).message}`,
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
    // The address of the key that actually left. Falling back to the identity family covers a
    // native backup (every family at once) and a single-family account that has no TRON address.
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

/**
 * The keystore's `address` field, in the exported family's own encoding.
 *
 * It is informational: the Web3 V3 spec does not require it, and every reader (including our own
 * importer) derives the real address from the key it decrypts. Writing the other family's
 * encoding would not break an import, but it would misdescribe the file — and TRON's `41…` form
 * is what TronLink round-trips, so each family keeps its own.
 */
function keystoreAddress(family: ChainFamily, privateKey: Bytes): string {
  const publicKey = Derivation.publicKeyFromPrivate(privateKey);
  return family === "tron"
    ? tronHexAddress(new TronAddress().fromPublicKey(publicKey))
    : evmAddressFromPublicKey(publicKey);
}

/**
 * Why a value was not accepted as an address, in the terms the user can act on.
 *
 * "Unrecognised format" leaves someone who mistyped one character of an otherwise perfect address
 * hunting for the wrong thing. A value that is SHAPED like an address failed its checksum or its
 * length; one that is not shaped like any address is a different mistake entirely.
 */
function addressRejection(value: string): string {
  const resembles = resembledFamily(value);
  return resembles
    ? `${value} looks like a ${resembles} address but its length or checksum is wrong`
    : `unrecognised address format: ${value}`;
}
