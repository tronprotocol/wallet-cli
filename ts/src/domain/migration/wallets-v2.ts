// Adds EVM addresses to seed/private-key wallets; leaves Ledger and watch wallets unchanged.
import type { Bytes, ChainAddresses, WalletsFile } from "../types/index.js";
import { derivePrivAddresses, deriveSeedAddresses } from "../wallet/index.js";
import { derivationMismatchError, resolveDerivation } from "../wallet/derivation-match.js";
import { SOURCE_KINDS } from "../sources/index.js";
import type { Source } from "../types/wallet.js";

export const WALLETS_VERSION = 2;

// v1 software-wallet address maps can lack EVM entries.
export interface WalletsFileV1 {
  version: number;
  wallets: Array<{ id: string; source: Record<string, unknown> }>;
  [key: string]: unknown;
}

export function walletsNeedPassword(doc: WalletsFileV1): boolean {
  return doc.wallets.some((w) => SOURCE_KINDS[w.source.type as Source["type"]]?.hasSecret);
}

export interface MigrationSecrets {
  seedFor(vaultId: string): Bytes;
  keyFor(keyId: string): Bytes;
}

export function migrateWalletsToV2(doc: WalletsFileV1, secrets: MigrationSecrets): WalletsFile {
  const wallets = doc.wallets.map((wallet) => {
    const source = wallet.source;

    if (source.type === "seed") {
      const seed = secrets.seedFor(source.vaultId as string); // once per wallet, not per index
      const cached = source.addresses as Record<string, Partial<ChainAddresses> | undefined>;
      const addresses = Object.fromEntries(
        Object.keys(cached).map((index) => {
          const derived = deriveSeedAddresses(seed, Number(index));
          // Preserve a matching legacy TRON address: replacing it would change the account key.
          const cachedTron = cached[index]?.tron;
          const resolved =
            cachedTron === undefined
              ? undefined
              : resolveDerivation(seed, "tron", Number(index), cachedTron);
          if (cachedTron !== undefined && resolved === undefined) {
            throw derivationMismatchError("tron", `${wallet.id}.${index}`);
          }
          return [
            index,
            resolved?.scheme === "legacy" ? { ...derived, tron: cachedTron } : derived,
          ];
        }),
      );
      return { ...wallet, source: { ...source, addresses } };
    }

    if (source.type === "privateKey") {
      const addresses = derivePrivAddresses(secrets.keyFor(source.keyId as string));
      return { ...wallet, source: { ...source, addresses } };
    }

    return wallet;
  });
  return { ...doc, version: WALLETS_VERSION, wallets } as unknown as WalletsFile;
}
