// Changes to the wallet index; the keystore applies each one inside its lock.
import type {
  AccountRef,
  ChainAddresses,
  MutationResult,
  Source,
  Wallet,
  WalletsFile,
} from "../types/index.js";
import { errorMessage, UsageError, WalletError } from "../errors/index.js";
import { SOURCE_KINDS } from "../sources/index.js";
import { accountIndices, accountRefOf, findByAddress, findBySource, firstIndex } from "./index.js";
import { derivedAccountLabel, labelKey, walletLabel } from "./label.js";

// Labels are unique ignoring case; an omitted label takes the next free wallet-<n>.
export function assignLabel(file: WalletsFile, ref: AccountRef, label?: string): void {
  const value = walletLabel(label ?? defaultLabel(file));
  for (const [k, existing] of Object.entries(file.labels)) {
    if (labelKey(existing) === labelKey(value) && k !== ref) {
      throw new UsageError("invalid_value", errorMessage`label '${value}' already in use by ${k}`);
    }
  }
  file.labels[ref] = value;
}

function defaultLabel(file: WalletsFile): string {
  // The wallet count already includes the new wallet.
  let n = file.wallets.length;
  const used = new Set(Object.values(file.labels).map((l) => l.toLowerCase()));
  while (used.has(`wallet-${n}`)) n++;
  return `wallet-${n}`;
}

// The stored account the source re-registers, if any.
function duplicateOf(file: WalletsFile, source: Source): AccountRef | null {
  switch (source.type) {
    case "seed":
      return findByAddress(file, source.addresses["0"] ?? {}, "seed");
    case "privateKey":
      return findByAddress(file, source.addresses, "privateKey");
    // Keep hardware and software accounts distinct even when they share an address.
    case "ledger":
      return findBySource(
        file,
        (s) => s.type === "ledger" && s.family === source.family && s.path === source.path,
      );
    // Deduplicate only against watch accounts.
    case "watch":
      return findBySource(
        file,
        (s) => s.type === "watch" && s.family === source.family && s.address === source.address,
      );
  }
}

/**
 * Adds a wallet, or selects the stored account it duplicates. A watch account is never selected
 * implicitly because it cannot sign. `changed` is false when the index needs no write.
 */
export function registerWallet(
  file: WalletsFile,
  wallet: Wallet,
  label?: string,
): MutationResult & { changed: boolean } {
  const selects = wallet.source.type !== "watch";
  const duplicate = duplicateOf(file, wallet.source);
  if (duplicate) {
    if (selects) file.activeAccount = duplicate;
    return { accountId: duplicate, created: false, changed: selects };
  }
  const ref = accountRefOf(wallet, wallet.source.type === "seed" ? 0 : null);
  file.wallets.push(wallet);
  assignLabel(file, ref, label);
  if (selects) file.activeAccount = ref;
  return { accountId: ref, created: true, changed: true };
}

export type HdWallet = Wallet & { source: Extract<Source, { type: "seed" }> };

export function isHdWallet(wallet: Wallet): wallet is HdWallet {
  return wallet.source.type === "seed";
}

// The slot after the highest stored index.
export function nextAccountIndex(source: Source): number {
  return (Math.max(-1, ...accountIndices(source)) + 1) | 0;
}

/**
 * Selects an HD account slot, storing `derived` when the slot is new. A new slot without a label
 * is named after the wallet's first account.
 */
export function selectDerivedAccount(
  file: WalletsFile,
  wallet: HdWallet,
  index: number,
  derived: ChainAddresses | undefined,
  label?: string,
): MutationResult {
  const created = derived !== undefined;
  if (derived) wallet.source.addresses[String(index)] = derived;
  const ref = accountRefOf(wallet, index);
  if (label !== undefined) assignLabel(file, ref, label);
  else if (created) {
    assignLabel(file, ref, derivedAccountLabel(file.labels[accountRefOf(wallet, 0)], index));
  }
  file.activeAccount = ref;
  return { accountId: ref, created };
}

export interface AccountRemoval {
  accountId: AccountRef;
  scope: "account" | "wallet";
  // The removed wallet whose secret file is deleted after the index is written.
  removedWallet?: Wallet;
  newActive: AccountRef | null;
}

/**
 * Removes an HD account, or the whole wallet for any other account and for HD index 0. Removing
 * the last HD account removes its wallet. A removed active account passes to the first wallet.
 */
export function removeAccount(file: WalletsFile, ref: AccountRef, input: string): AccountRemoval {
  const [walletId, idxStr] = ref.split(".") as [string, string | undefined];
  const wallet = file.wallets.find((w) => w.id === walletId);
  if (!wallet) throw new WalletError("invalid_value", errorMessage`unknown wallet ${input}`);

  if (wallet.source.type === "seed" && idxStr !== undefined && idxStr !== "0") {
    if (!(idxStr in wallet.source.addresses)) {
      throw new WalletError("invalid_value", errorMessage`unknown account ${input}`);
    }
    delete wallet.source.addresses[idxStr];
    delete file.labels[ref];
    const emptied = accountIndices(wallet.source).length === 0;
    if (emptied) {
      file.wallets = file.wallets.filter((w) => w.id !== walletId);
      delete file.labels[walletId];
    }
    if (file.activeAccount === ref || (emptied && walletOf(file.activeAccount) === walletId)) {
      file.activeAccount = firstAccount(file);
    }
    return {
      accountId: ref,
      scope: emptied ? "wallet" : "account",
      ...(emptied ? { removedWallet: wallet } : {}),
      newActive: file.activeAccount,
    };
  }

  file.wallets = file.wallets.filter((w) => w.id !== walletId);
  for (const k of Object.keys(file.labels)) {
    if (k === walletId || k.startsWith(`${walletId}.`)) delete file.labels[k];
  }
  if (walletOf(file.activeAccount) === walletId) file.activeAccount = firstAccount(file);
  return {
    accountId: walletId,
    scope: "wallet",
    ...(SOURCE_KINDS[wallet.source.type].hasSecret ? { removedWallet: wallet } : {}),
    newActive: file.activeAccount,
  };
}

function walletOf(ref: AccountRef | null): string | undefined {
  return ref?.split(".")[0];
}

function firstAccount(file: WalletsFile): AccountRef | null {
  const first = file.wallets[0];
  return first ? accountRefOf(first, firstIndex(first)) : null;
}
