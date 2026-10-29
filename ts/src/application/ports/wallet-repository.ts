import type { AccountRef, ChainFamily, MutationResult, Wallet } from "../../domain/types/index.js";
import type { AccountStore } from "./account-store.js";

export interface WalletImport {
  secret: string;
  type: "seed" | "privateKey";
  passphrase?: string;
  label?: string;
}

export interface WalletRepository extends AccountStore {
  import(input: WalletImport): MutationResult;
  registerLedger(input: {
    family: ChainFamily;
    path: string;
    address: string;
    label?: string;
  }): MutationResult;
  registerWatch(input: { family: ChainFamily; address: string; label?: string }): MutationResult;
  // Without a label, a newly derived account gets the wallet's default derived label.
  addAccount(walletId: string, index?: number, label?: string): MutationResult;
  resolveWallet(idOrLabel: string): Wallet;
  rename(
    refOrLabel: string,
    label: string,
  ): {
    accountId: AccountRef;
    previousLabel?: string;
    label: string;
  };
  setActive(refOrLabel: string): { accountId: AccountRef; previous: AccountRef | null };
  changePassword(oldPassword: string, newPassword: string): { wallets: string[]; count: number };
  delete(refOrWallet: string): {
    accountId: AccountRef;
    scope: "account" | "wallet";
    secretRemoved: boolean;
    // The secret's file that could not be deleted after the index stopped naming it.
    retainedSecretFile?: string;
    newActive: AccountRef | null;
  };
  revealMnemonic(vaultId: string): { mnemonic: string; passphraseSet: boolean };
}
