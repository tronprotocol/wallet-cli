/**
 * The registered migrations (ADR-0008). Adding one = one entry here.
 *
 * Only wallets.json has ever needed a migration: contacts.json is already family-keyed at rest
 * (`entries` is Partial<Record<ChainFamily, …>> and every entry carries its own `family`), and
 * tokens.json is keyed by network id, so EVM only adds keys to both.
 */
import { join } from "node:path";
import type { MigrationStep } from "../adapters/outbound/persistence/migration.js";
import type { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { Keystore } from "../adapters/outbound/keystore/index.js";
import {
  WALLETS_VERSION,
  migrateWalletsToV2,
  walletsNeedPassword,
  type WalletsFileV1,
} from "../domain/migration/wallets-v2.js";

export function migrationSteps(root: string, store: AtomicFileStore): MigrationStep[] {
  return [
    {
      path: join(root, "wallets.json"),
      currentVersion: WALLETS_VERSION,
      needsPassword: (doc) => walletsNeedPassword(doc as WalletsFileV1),
      migrate: (doc, password) => {
        // A throwaway Keystore purely as the secret reader. Its own #assertPassword checks the
        // verifier, so a wrong password surfaces as auth_failed rather than corrupt output.
        const reader = new Keystore(root, store, () => password ?? "");
        return migrateWalletsToV2(doc as WalletsFileV1, {
          seedFor: (vaultId) => reader.decryptSeed(vaultId),
          keyFor: (keyId) => reader.decryptKey(keyId),
        });
      },
    },
  ];
}
