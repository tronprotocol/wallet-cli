/**
 * tokens.json v1 → v2 — the network half of every scope key moves to its CAIP-2 spelling.
 *
 * The user token layer is filed under `<networkId>|<accountRef>`. Renaming the builtin ids
 * without rewriting these keys does not fail loudly: the lookup simply finds nothing, and the
 * user sees an empty token list rather than an error — which is the worse of the two outcomes,
 * because it reads as "I never added that token".
 */
import type { TokensFile } from "../types/token.js";

export const TOKENS_VERSION = 2;

/**
 * The ids this CLI carried before its canonical ids became CAIP-2. A network absent from this map
 * is user-configured and keeps whatever key it already had.
 *
 * The EVM ids are listed even though they never reached a published release, which is the reason
 * they were dropped from the alias book. The two surfaces fail differently: an unresolvable id in
 * config.yaml is an error the user reads and fixes, while an unmatched scope key here just yields
 * an empty token list. Covering a branch build costs four lines; a silent loss costs someone their
 * token book.
 */
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
    // Only the FIRST separator divides network from account: the ref is opaque, and this code
    // has no business assuming it holds no separator of its own.
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
