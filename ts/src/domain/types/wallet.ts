/**
 * SharedTypes — wallet data shapes (persisted in wallets.json).
 */
import type { ChainFamily } from "../family/index.js";
import type { AccountRef } from "./network.js";

/** one secret derives every family → all slots always present (non-optional). */
export type ChainAddresses = Record<ChainFamily, string>;

/**
 * All address caches live inside `source` next to their secret-ref:
 * - seed: index("0","1",…) → both-chain addresses (known indices = Object.keys(addresses))
 * - privateKey: flat both-chain addresses (no index, no "" sentinel)
 * - ledger: single family + path + watch-only address (no index)
 * - watch: single family + address; no secret, no path, no file (= ledger minus path)
 */
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

/**
 * The one account shape every `wallet` command returns (max-disclosure descriptor).
 * `accountId` is the canonical ref you pass back to `--account` (seed: `wlt_x.<index>`;
 * privateKey/ledger/watch: `wlt_x`). `family`/`path` appear only for ledger/watch (single-chain)
 * and ledger respectively. The wallet
 * id is intentionally omitted — it is just `accountId` minus the `.index` suffix.
 */
export interface AccountDescriptor {
  accountId: AccountRef;
  label?: string;
  type: Source["type"];
  index: number | null;
  active: boolean;
  addresses: Partial<ChainAddresses>;
  family?: ChainFamily;
  path?: string;
}

/** mutators that may hit an existing account report whether they actually created one. */
export interface MutationResult {
  accountId: AccountRef;
  created: boolean;
}
