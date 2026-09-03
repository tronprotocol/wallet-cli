/**
 * The registered migrations. Adding one = one entry here.
 *
 * contacts.json needs none: it is family-keyed at rest (`entries` is
 * Partial<Record<ChainFamily, …>> and every entry carries its own `family`), so a new family only
 * adds keys. tokens.json is keyed by network ID, which was fine while ids never changed — the
 * move to CAIP-2 ids is what put it here beside wallets.json.
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
import { TOKENS_VERSION, migrateTokensToV2 } from "../domain/migration/tokens-v2.js";
import type { TokensFile } from "../domain/types/token.js";

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
    {
      path: join(root, "tokens.json"),
      currentVersion: TOKENS_VERSION,
      // Scope keys are not secrets and the file holds none, so nothing here needs unlocking.
      needsPassword: () => false,
      migrate: (doc) => migrateTokensToV2(doc as TokensFile),
    },
  ];
}
