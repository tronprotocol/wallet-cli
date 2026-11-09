import type { ChainFamily } from "./chain-family.js";

// A TRON id is canonical as 64 lowercase hex digits; input may add a 0x prefix.
const TX_HASH: { [F in ChainFamily]: RegExp } = {
  tron: /^[0-9a-fA-F]{64}$/,
  evm: /^0x[0-9a-fA-F]{64}$/,
};
const TX_HASH_INPUT: { [F in ChainFamily]: RegExp } = {
  tron: /^(?:0x)?[0-9a-fA-F]{64}$/,
  evm: TX_HASH.evm,
};

// The family's own spelling: no prefix on TRON, 0x on EVM.
export function isTxHash(family: ChainFamily, value: string): boolean {
  return TX_HASH[family].test(value);
}

export function txHashInputPattern(family: ChainFamily): RegExp {
  return TX_HASH_INPUT[family];
}

// Canonical lowercase hash, or undefined when value is not an accepted input.
export function normalizeTxHash(family: ChainFamily, value: string): string | undefined {
  if (!TX_HASH_INPUT[family].test(value)) return undefined;
  const lower = value.toLowerCase();
  return family === "tron" ? lower.replace(/^0x/, "") : lower;
}
