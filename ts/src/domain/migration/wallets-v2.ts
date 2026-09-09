/**
 * wallets.json v1 → v2: every account gains its EVM address.
 *
 * The migration re-runs the SAME address derivation the creation path uses — deriveSeedAddresses
 * and derivePrivAddresses — so it produces exactly what `create` / `import` would have produced.
 * Deriving the EVM address any other way (e.g. re-encoding the cached TRON address, which happens
 * to work while both families share a key) would be a second, independent statement of the rule,
 * free to drift from the first.
 *
 *   - seed / privateKey — hold a local secret, so both decrypt and re-derive. Needs the password.
 *   - ledger / watch — nothing to do. Single-family by construction; they carry no address map.
 *
 * A cached TRON address is evidence, not staleness: a legacy match is kept, while a value no
 * known template explains stops the migration instead of silently replacing the account.
 */
import type { Bytes, ChainAddresses, WalletsFile } from "../types/index.js";
import { derivePrivAddresses, deriveSeedAddresses } from "../wallet/index.js";
import { derivationMismatchError, resolveDerivation } from "../wallet/derivation-match.js";
import { SOURCE_KINDS } from "../sources/index.js";
import type { Source } from "../types/wallet.js";

export const WALLETS_VERSION = 2;

/** the v1 document: identical to WalletsFile except its address maps lack `evm`. */
export interface WalletsFileV1 {
  version: number;
  wallets: Array<{ id: string; source: Record<string, unknown> }>;
  [key: string]: unknown;
}

export function walletsNeedPassword(doc: WalletsFileV1): boolean {
  return doc.wallets.some((w) => SOURCE_KINDS[w.source.type as Source["type"]]?.hasSecret);
}

/** the secret material the migration needs, injected so the rules stay free of keystore I/O. */
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
          // The one value re-derivation must not overwrite: a cached TRON address that a LEGACY
          // template explains is not stale — it is the only record of which key owns the account.
          // v1 shipped with the old TRON template, so a 4.12.0 user who ran `derive` reaches this
          // migration holding exactly such a value; replacing it would hand the account to a
          // different key and hide it from every legacy-derivation guard downstream.
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
