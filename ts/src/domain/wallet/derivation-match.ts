/**
 * Which BIP44 template produced a stored account — the one decision that tells a legacy account
 * from a current one.
 *
 * Nothing in wallets.json records the template: an account derived before the TRON path was
 * corrected and one derived after are both `addresses["1"] = { tron, evm }`. The cached address
 * is the only evidence, and reading it takes the seed. So this is the single place that answers
 * the question, and both callers that hold a seed go through it — the signer, which refuses a
 * legacy match, and `backup --keystore`, which exports it.
 */
import type { Bytes, ChainFamily, KeyPair } from "../types/index.js";
import { Derivation } from "../derivation/index.js";
import { addressCodec } from "../family/index.js";
import { WalletError } from "../errors/index.js";

export interface ResolvedDerivation {
  path: string;
  /** `legacy` = a template this CLI no longer produces through its default derive flow. */
  scheme: "current" | "legacy";
  keyPair: KeyPair;
}

/**
 * The template whose address equals `cachedAddress`, or `undefined` when none does.
 *
 * `undefined` is not the same statement as `legacy`: it means the file disagrees with the vault
 * (a hand-edited wallets.json, or a wallet pointing at the wrong vault), which is a different
 * problem with a different fix, so callers must not collapse the two.
 */
export function resolveDerivation(
  seed: Bytes,
  family: ChainFamily,
  index: number,
  cachedAddress: string,
): ResolvedDerivation | undefined {
  const codec = addressCodec(family);
  // Canonical on both sides: an address cached before canonicalisation may be all-lowercase EVM,
  // and it still names the same account.
  const wanted = codec.canonical(cachedAddress);

  const candidates: Array<{ path: string; scheme: "current" | "legacy" }> = [
    { path: Derivation.path(family, index), scheme: "current" },
    ...Derivation.legacyPaths(family, index).map((path) => ({ path, scheme: "legacy" as const })),
  ];

  for (const { path, scheme } of candidates) {
    const keyPair = Derivation.derive(seed, path);
    if (codec.canonical(codec.fromPublicKey(keyPair.publicKey)) === wanted) {
      return { path, scheme, keyPair };
    }
  }
  return undefined;
}

/**
 * Every account in an address map that a legacy template explains — accounts this version's
 * default mnemonic recovery will not recreate automatically.
 *
 * The native `backup` writes the mnemonic, which can still derive these keys when given their old
 * paths. This version's import/derive flow uses the current template by default, though, so the
 * warning names every account that needs an explicit migration.
 *
 * Index 0 is skipped without deriving: both templates agree there, so it can never be stranded,
 * and naming it would push an untouched user through a rescue they do not need. An address no
 * template explains is skipped too — that is a file/vault disagreement (`resolveDerivation`
 * returning `undefined`), a different problem with a different fix.
 */
export function legacyAccounts(
  seed: Bytes,
  addresses: Record<string, Partial<Record<ChainFamily, string>>>,
): Array<{ index: number; path: string }> {
  const out: Array<{ index: number; path: string }> = [];
  for (const [key, addr] of Object.entries(addresses)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index === 0) continue;
    const cached = addr?.tron;
    if (cached === undefined) continue;
    const resolved = resolveDerivation(seed, "tron", index, cached);
    if (resolved?.scheme === "legacy") out.push({ index, path: resolved.path });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Complete, ordered recovery procedure shipped with the affected release. */
export const LEGACY_DERIVATION_RECOVERY_GUIDE =
  "https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md";

/**
 * The refusal a stranded account raises, wherever it is raised.
 *
 * Signing and `derive` refuse for different reasons — one key cannot be produced, one wallet must
 * not mix templates — but both direct the user to the same ordered recovery procedure. The error
 * must not inline only the TRON half of that procedure: deleting the slot also removes its EVM
 * address from the local account list.
 */
export function legacyDerivationError(
  ref: string,
  path: string,
  refused: "sign" | "derive",
  labels: { account?: string; wallet?: string } = {},
): WalletError {
  const walletId = ref.split(".")[0]!;
  const account = labels.account ? JSON.stringify(labels.account) : ref;
  const wallet = labels.wallet ? JSON.stringify(labels.wallet) : walletId;
  const lead =
    refused === "sign"
      ? `account ${account} was derived at ${path}, a TRON path this version no longer produces, so it cannot be signed here.`
      : `wallet ${wallet} holds account ${account} at ${path}, a TRON path this version no longer produces, so no further accounts can be derived from it.`;
  return new WalletError(
    "legacy_derivation",
    `${lead} Follow the complete recovery procedure before deleting anything:\n` +
      `  ${LEGACY_DERIVATION_RECOVERY_GUIDE}`,
  );
}

/**
 * `resolveDerivation` finding no match at all: the file and the vault disagree, which is a
 * different problem from a stranded account and carries no rescue — there is nothing to export,
 * because no key of this seed owns that address.
 */
export function derivationMismatchError(
  family: ChainFamily,
  ref: string,
  consequence?: string,
): WalletError {
  return new WalletError(
    "derivation_mismatch",
    `the stored ${family} address for ${ref} matches no derivation path of this seed; ` +
      `wallets.json and the vault disagree${consequence ? `, ${consequence}` : ""}`,
  );
}
