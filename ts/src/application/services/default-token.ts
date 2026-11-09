import type { NetworkId } from "../../domain/types/index.js";

export type TokenDefaultCapability = "x402.serve" | "bai.recharge" | "gasfree.transfer";

interface TokenDefault {
  readonly token: string;
  // Networks whose default differs.
  readonly byNetwork?: Readonly<Record<NetworkId, string>>;
}

const TOKEN_DEFAULTS: Readonly<Record<TokenDefaultCapability, TokenDefault>> = {
  "x402.serve": { token: "USDT" },
  "bai.recharge": { token: "USDT", byNetwork: { "eip155:8453": "USDC" } },
  "gasfree.transfer": { token: "USDT" },
};

// The token symbol a capability uses when the caller names none; without a network, the
// capability's default on networks that set no other.
export function defaultToken(capability: TokenDefaultCapability, network?: NetworkId): string {
  const entry = TOKEN_DEFAULTS[capability];
  return (network === undefined ? undefined : entry.byNetwork?.[network]) ?? entry.token;
}
