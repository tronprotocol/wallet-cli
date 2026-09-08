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
  /** `legacy` = a template this CLI no longer produces; the account cannot be re-derived. */
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
 * Every account in an address map that a legacy template explains — the accounts a recovery
 * phrase does not actually back up.
 *
 * The native `backup` writes the mnemonic, and the mnemonic re-derives on the CURRENT template
 * in every wallet, this one included. So an account still on the old TRON path is absent from
 * its own wallet's backup, and the only honest export tells the user which ones.
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

/** Where the 4.13.1 notes explain the path correction. One constant: five strings link it. */
const RELEASE_NOTES = "https://github.com/tronprotocol/wallet-cli/releases/tag/wallet-cli-4.13.1";

/**
 * The refusal a stranded account raises, wherever it is raised.
 *
 * Signing and `derive` refuse for different reasons — one key cannot be produced, one wallet must
 * not mix templates — but the way out is identical, and it is the only route the user gets. Two
 * hand-maintained copies is how a renamed flag or a bumped tag ends up sending half of them a
 * command that no longer works.
 *
 * `--keystore` is named explicitly because the native `backup` writes the recovery phrase, and
 * the phrase is exactly what does NOT recover this account: the old path is unique to this CLI,
 * so no other wallet reaches it.
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
  const selector = labels.account ? shellQuote(labels.account) : ref;
  const lead =
    refused === "sign"
      ? `account ${account} was derived at ${path}, a TRON path this version no longer produces, so it cannot be signed here.`
      : `wallet ${wallet} holds account ${account} at ${path}, a TRON path this version no longer produces, so no further accounts can be derived from it.`;
  return new WalletError(
    "legacy_derivation",
    `${lead} Export that account, re-import it as a standalone account, then drop the old slot:\n` +
      `  wallet-cli backup ${selector} --keystore --network tron:728126428 --password-stdin\n` +
      `  wallet-cli import keystore <file>   (needs a terminal)\n` +
      `  wallet-cli delete ${selector} --yes   (drops the stranded slot, keeping the seed and its other accounts, and unblocks 'derive'; without --yes it prompts for the label, so it needs a terminal)\n` +
      `Your recovery phrase will NOT recover it in another wallet — the old path is unique to wallet-cli. ` +
      `See ${RELEASE_NOTES}`,
  );
}

/** A label used as a POSIX-shell command argument, including labels containing a single quote. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
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
