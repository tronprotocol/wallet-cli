import type { AccountDescriptor, AccountRef, Bytes, Wallet } from "../../domain/types/index.js";
import type { ChainFamily } from "../../domain/family/index.js";

/**
 * Application-facing wallet boundary.
 *
 * The application intentionally asks for account operations, not a filesystem keystore.
 * File-backed persistence, encryption and locking belong to the outbound adapter.
 */
export interface AccountStore {
  activeAccount(): AccountRef | null;
  resolveAccount(refOrLabel: string, family?: ChainFamily): { wallet: Wallet; index: number };
  describe(refOrLabel: string): AccountDescriptor;
  list(): AccountDescriptor[];
  /** ids of wallets whose source.type this build does not know — skipped by list() rather than
   *  failing it. */
  unreadable(): string[];
  isInitialized(): boolean;
  verifyPassword(password: string): boolean;
  decryptSeed(vaultId: string): Bytes;
  decryptKey(keyId: string): Bytes;
}
