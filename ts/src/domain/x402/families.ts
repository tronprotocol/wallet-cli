import type { ChainFamily } from "../family/chain-family.js";

export interface X402FamilyRules {
  // CAIP-2 namespace of the family's x402 network ids.
  readonly namespace: string;
  // Radix of the chain id in the x402 network id.
  readonly chainIdRadix: 10 | 16;
  // x402 peers spell this family's chain ids in either radix, so a facilitator's own spelling is asked for.
  readonly peerSpellingVaries: boolean;
  // Whether the exact_gasfree scheme exists on the family.
  readonly gasfree: boolean;
}

export const X402_FAMILIES: Readonly<Record<ChainFamily, X402FamilyRules>> = {
  tron: { namespace: "tron", chainIdRadix: 16, peerSpellingVaries: true, gasfree: true },
  evm: { namespace: "eip155", chainIdRadix: 10, peerSpellingVaries: false, gasfree: false },
};

export type X402Scheme = "exact" | "exact_gasfree";

export function supportsScheme(family: ChainFamily, scheme: string): boolean {
  if (scheme === "exact") return true;
  return scheme === "exact_gasfree" && X402_FAMILIES[family].gasfree;
}
