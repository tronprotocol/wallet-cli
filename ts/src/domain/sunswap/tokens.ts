/**
 * The two symbols SunSwap resolves without asking anyone.
 *
 * `TRX` and `WTRX` are not address-book entries: TRX is the native coin, which the market API
 * addresses by a fixed pseudo-address, and WTRX is a contract deployed once per network. Both are
 * facts about the chain, so they are settled here rather than looked up — a user should not have
 * to `token add` the coin the chain is named after.
 *
 * Everything else is an address-book question and belongs to the layer that owns the book.
 */

/** The address the market API uses for native TRX. Not an ordinary TRC-20 contract. */
export const NATIVE_TRX_ADDRESS = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

/** Wrapped TRX, deployed per network. */
const WTRX_BY_NETWORK: Readonly<Record<string, string>> = {
  "tron:728126428": "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",
  "tron:3448148188": "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a",
};

/**
 * Resolve `TRX` or `WTRX` for a network, case-insensitively. Returns undefined for any other
 * symbol, and for WTRX on a network with no known deployment — inventing one there would send a
 * user's trade to an address nobody has verified.
 */
export function builtinSunSwapToken(symbol: string, networkId: string): string | undefined {
  const upper = symbol.trim().toUpperCase();
  if (upper === "TRX") return NATIVE_TRX_ADDRESS;
  if (upper === "WTRX") return WTRX_BY_NETWORK[networkId];
  return undefined;
}
