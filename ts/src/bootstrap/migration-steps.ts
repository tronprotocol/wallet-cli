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
      migrate: (doc, password, refresh) => {
        // Authenticate through the keystore before decrypting migration inputs.
        const reader = new Keystore(root, store, () => password ?? "");
        return migrateWalletsToV2(doc as WalletsFileV1, {
          seedFor: (vaultId) => {
            refresh();
            return reader.decryptSeed(vaultId);
          },
          keyFor: (keyId) => {
            refresh();
            return reader.decryptKey(keyId);
          },
        });
      },
    },
    {
      path: join(root, "tokens.json"),
      currentVersion: TOKENS_VERSION,
      needsPassword: () => false,
      migrate: (doc) => migrateTokensToV2(doc as TokensFile),
    },
  ];
}
