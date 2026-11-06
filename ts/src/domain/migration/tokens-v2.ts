// Migrates the network portion of <networkId>|<accountRef> scope keys to CAIP-2.
import type { TokensFile } from "../types/token.js";

export const TOKENS_VERSION = 2;

const RENAMED_NETWORK_IDS: Record<string, string> = {
  "tron:mainnet": "tron:728126428",
  "tron:shasta": "tron:2494104990",
  "tron:nile": "tron:3448148188",
  "evm:1": "eip155:1",
  "evm:11155111": "eip155:11155111",
  "evm:56": "eip155:56",
  "evm:97": "eip155:97",
};

export function migrateTokensToV2(doc: TokensFile): TokensFile {
  const entries: TokensFile["entries"] = {};
  for (const [key, list] of Object.entries(doc.entries ?? {})) {
    // Account references are opaque and may contain separators.
    const cut = key.indexOf("|");
    if (cut === -1) {
      entries[key] = list;
      continue;
    }
    const networkId = key.slice(0, cut);
    entries[`${RENAMED_NETWORK_IDS[networkId] ?? networkId}${key.slice(cut)}`] = list;
  }
  return { version: TOKENS_VERSION, entries };
}
