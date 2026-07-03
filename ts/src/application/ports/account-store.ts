import type { AccountDescriptor, AccountRef, Bytes, Wallet } from "../../domain/types/index.js";

/**
 * Application-facing wallet boundary.
 *
 * The application intentionally asks for account operations, not a filesystem keystore.
 * File-backed persistence, encryption and locking belong to the outbound adapter.
 */
export interface AccountStore {
  activeAccount(): AccountRef | null;
  resolveAccount(refOrLabel: string): { wallet: Wallet; index: number };
  describe(refOrLabel: string): AccountDescriptor;
  list(): AccountDescriptor[];
  isInitialized(): boolean;
  verifyPassword(password: string): boolean;
  decryptSeed(vaultId: string): Bytes;
  decryptKey(keyId: string): Bytes;
}
