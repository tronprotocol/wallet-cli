import type { AccountDescriptor, AccountRef, Bytes, Wallet } from "../../domain/types/index.js";
import type { ChainFamily } from "../../domain/family/index.js";

export interface AccountStore {
  activeAccount(): AccountRef | null;
  resolveAccount(refOrLabel: string, family?: ChainFamily): { wallet: Wallet; index: number };
  describe(refOrLabel: string): AccountDescriptor;
  list(): AccountDescriptor[];
  // Wallet IDs with unsupported source types, omitted from list().
  unreadable(): string[];
  isInitialized(): boolean;
  verifyPassword(password: string): boolean;
  decryptSeed(vaultId: string): Bytes;
  decryptKey(keyId: string): Bytes;
}
