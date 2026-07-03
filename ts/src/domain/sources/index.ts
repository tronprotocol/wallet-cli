/**
 * Source Registry — the single source of wallet-source facts. Folds scattered
 * `source.type === "seed" ? … : source.type === "ledger" …`
 * guards that decide a source's display label, whether it is HD, and whether it holds a local
 * secret into one exhaustive table.
 *
 * The win is compile-time: `SOURCE_KINDS` is keyed by `Source["type"]`, so adding a member to the
 * `Source` union turns every consumer that reads the table into a type error until the new kind is
 * described here — the previous behaviour was a silent fall-through to the default branch.
 *
 * Per-instance facts that need the source *value* (its pinned family, its secret-blob id) stay as
 * helpers below rather than in the table, because they read fields the table can't hold.
 *
 * Adding a source = one entry in SOURCE_KINDS (+ the value-level branches the type system still
 * forces: the signer switch, the import path, the blob codec).
 */
import type { ChainFamily } from "../family/index.js";
import type { Source } from "../types/wallet.js";

export interface SourceKind {
  /** human display name (`wallet list` "Type" column). */
  label: string;
  /** HD (multi-account, derivable) — only seed. */
  isHD: boolean;
  /** holds an encrypted secret blob locally (seed/privateKey) — ledger/watch do not. */
  hasSecret: boolean;
}

export const SOURCE_KINDS: Record<Source["type"], SourceKind> = {
  seed: { label: "HD", isHD: true, hasSecret: true },
  privateKey: { label: "private key", isHD: false, hasSecret: true },
  ledger: { label: "Ledger", isHD: false, hasSecret: false },
  watch: { label: "watch-only", isHD: false, hasSecret: false },
};

/** display label for a source type; passes unknown values through unchanged (render fallback). */
export function sourceLabel(type: unknown): string {
  return typeof type === "string" && type in SOURCE_KINDS
    ? SOURCE_KINDS[type as Source["type"]].label
    : String(type ?? "");
}

/**
 * The chain family a single-family source is pinned to (ledger/watch), or undefined for the
 * multi-family secret sources (seed/privateKey, which span every enabled family). A new
 * single-family source carrying `family` is picked up here automatically.
 */
export function sourceFamily(s: Source): ChainFamily | undefined {
  return "family" in s ? s.family : undefined;
}
