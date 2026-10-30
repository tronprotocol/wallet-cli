// Internal chain ids use decimal; the x402 radix comes from the family table.
import type { ChainFamily } from "../family/chain-family.js";
import { UsageError } from "../errors/index.js";
import { X402_FAMILIES } from "./families.js";

export interface X402NetworkIdentity {
  family: ChainFamily;
  // Decimal.
  chainId: string;
}

const FAMILY_BY_NAMESPACE = new Map(
  (Object.keys(X402_FAMILIES) as ChainFamily[]).map((family) => [
    X402_FAMILIES[family].namespace,
    family,
  ]),
);

// Accept either numeric base for every namespace.
const X402_ID = /^([a-z0-9-]+):(0x[0-9a-f]{1,64}|[0-9]{1,78})$/;

export function toX402Network(network: X402NetworkIdentity): string {
  const { namespace, chainIdRadix } = X402_FAMILIES[network.family];
  const value = BigInt(network.chainId);
  return `${namespace}:${chainIdRadix === 16 ? `0x${value.toString(16)}` : value.toString(10)}`;
}

export function fromX402Network(id: string): X402NetworkIdentity {
  const match = X402_ID.exec(id.trim().toLowerCase());
  const family = match ? FAMILY_BY_NAMESPACE.get(match[1]!) : undefined;
  if (!match || !family) {
    throw new UsageError("unsupported_network", `not an x402 network id: ${id}`);
  }
  return { family, chainId: BigInt(match[2]!).toString(10) };
}

// The family of an x402 network id; undefined when the id is not one.
export function x402NetworkFamily(id: string): ChainFamily | undefined {
  try {
    return fromX402Network(id).family;
  } catch {
    return undefined;
  }
}

// Compare chain identity without altering signed wire values.
export function sameX402Network(left: string, right: string): boolean {
  try {
    const a = fromX402Network(left);
    const b = fromX402Network(right);
    return a.family === b.family && a.chainId === b.chainId;
  } catch {
    return false;
  }
}
