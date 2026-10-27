// Cached addresses identify derivation templates; the registry stores no template field.
import type { Bytes, ChainFamily, KeyPair } from "../types/index.js";
import { Derivation } from "../derivation/index.js";
import { addressCodec } from "../family/index.js";
import { WalletError } from "../errors/index.js";

export interface ResolvedDerivation {
  path: string;
  // legacy = a non-default derivation template.
  scheme: "current" | "legacy";
  keyPair: KeyPair;
}

// undefined means no known template matches; callers must distinguish it from a legacy match.
export function resolveDerivation(
  seed: Bytes,
  family: ChainFamily,
  index: number,
  cachedAddress: string,
): ResolvedDerivation | undefined {
  const codec = addressCodec(family);
  // Equivalent EVM spellings must match the same account.
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

// Finds matching non-default TRON paths that default mnemonic recovery will not recreate.
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

export const LEGACY_DERIVATION_RECOVERY_GUIDE =
  "https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md";

// Link the complete recovery flow: deleting a slot also removes its EVM address.
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

// No known template matches; do not report this as a legacy account.
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
