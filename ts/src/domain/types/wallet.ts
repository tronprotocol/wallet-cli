import type { ChainFamily } from "../family/chain-family.js";
import type { AccountRef } from "./network.js";

export type ChainAddresses = Record<ChainFamily, string>;

// Seed address maps are keyed by decimal account index.
export type Source =
  | { type: "seed"; vaultId: string; addresses: Record<string, ChainAddresses> }
  | { type: "privateKey"; keyId: string; addresses: ChainAddresses }
  | { type: "ledger"; family: ChainFamily; path: string; address: string }
  | { type: "watch"; family: ChainFamily; address: string };

export interface Wallet {
  id: string;
  source: Source;
}

export interface WalletsFile {
  version: number;
  activeAccount: AccountRef | null;
  wallets: Wallet[];
  labels: Record<AccountRef, string>;
}

// accountId is accepted by --account; family is for Ledger/watch and path is for Ledger.
export interface AccountDescriptor {
  accountId: AccountRef;
  label?: string;
  type: Source["type"];
  index: number | null;
  active: boolean;
  addresses: Partial<ChainAddresses>;
  family?: ChainFamily;
  path?: string;
  // HD wallet id accepted by derive --seed-id; index identifies its account slot.
  seedId?: string;
  // Verified BIP32 paths by family; null when derivation information is unavailable.
  derivationPath?: Record<string, string> | null;
}

export interface MutationResult {
  accountId: AccountRef;
  created: boolean;
}
