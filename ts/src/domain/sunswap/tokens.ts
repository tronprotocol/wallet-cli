// Market API marker for native TRX, not a TRC20 contract.
export const NATIVE_TRX_ADDRESS = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

const WTRX_BY_NETWORK: Readonly<Record<string, string>> = {
  "tron:728126428": "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",
  "tron:3448148188": "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a",
};

export function builtinSunSwapToken(symbol: string, networkId: string): string | undefined {
  const upper = symbol.trim().toUpperCase();
  if (upper === "TRX") return NATIVE_TRX_ADDRESS;
  if (upper === "WTRX") return WTRX_BY_NETWORK[networkId];
  return undefined;
}
