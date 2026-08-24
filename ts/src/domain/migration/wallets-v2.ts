/**
 * wallets.json v1 → v2: every account gains its EVM address (ADR-0008).
 *
 * The migration re-runs the SAME address derivation the creation path uses — deriveSeedAddresses
 * and derivePrivAddresses — so it produces exactly what `create` / `import` would have produced.
 * Deriving the EVM address any other way (e.g. re-encoding the cached TRON address, which happens
 * to work while both families share a key) would be a second, independent statement of the rule,
 * free to drift from the first.
 *
 *   - seed / privateKey — hold a local secret, so both decrypt and re-derive. Needs the password.
 *   - ledger / watch — nothing to do. Single-family by construction; they carry no address map.
 */
import type { Bytes, WalletsFile } from "../types/index.js";
import { derivePrivAddresses, deriveSeedAddresses } from "../wallet/index.js";
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
      const indices = Object.keys(source.addresses as Record<string, unknown>);
      const addresses = Object.fromEntries(
        indices.map((index) => [index, deriveSeedAddresses(seed, Number(index))]),
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
