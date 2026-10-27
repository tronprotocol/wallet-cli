import type { ChainFamily } from "../family/index.js";
import type { Source } from "../types/wallet.js";

export interface SourceKind {
  label: string;
  // Supports deriving multiple accounts.
  isHD: boolean;
  // Holds an encrypted local secret.
  hasSecret: boolean;
}

export const SOURCE_KINDS: Record<Source["type"], SourceKind> = {
  seed: { label: "HD", isHD: true, hasSecret: true },
  privateKey: { label: "private key", isHD: false, hasSecret: true },
  ledger: { label: "Ledger", isHD: false, hasSecret: false },
  watch: { label: "watch-only", isHD: false, hasSecret: false },
};

// Unknown values are stringified for display; nullish values become empty strings.
export function sourceLabel(type: unknown): string {
  return typeof type === "string" && type in SOURCE_KINDS
    ? SOURCE_KINDS[type as Source["type"]].label
    : String(type ?? "");
}

// Returns the pinned family; undefined for sources that span families.
export function sourceFamily(s: Source): ChainFamily | undefined {
  return "family" in s ? s.family : undefined;
}
