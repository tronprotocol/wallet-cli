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
  registerWatch(input: {
    family: ChainFamily;
    address: string;
    label?: string;
  }): MutationResult;
  addAccount(walletId: string, index?: number): MutationResult;
  resolveWallet(idOrLabel: string): Wallet;
  rename(refOrLabel: string, label: string): {
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
    newActive: AccountRef | null;
  };
  revealMnemonic(vaultId: string): { mnemonic: string; passphraseSet: boolean };
}
