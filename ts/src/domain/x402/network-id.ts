// x402 emits TRON chain ids in hex and EIP-155 ids in decimal; internal chain ids use decimal.
import type { ChainFamily } from "../family/chain-family.js";
import { UsageError } from "../errors/index.js";

export interface X402NetworkIdentity {
  family: ChainFamily;
  // Decimal.
  chainId: string;
}

// Accept either numeric base for both namespaces.
const X402_ID = /^(tron|eip155):(0x[0-9a-f]{1,64}|[0-9]{1,78})$/;

export function toX402Network(network: X402NetworkIdentity): string {
  const value = BigInt(network.chainId);
  return network.family === "tron"
    ? `tron:0x${value.toString(16)}`
    : `eip155:${value.toString(10)}`;
}

export function fromX402Network(id: string): X402NetworkIdentity {
  const match = X402_ID.exec(id.trim().toLowerCase());
  if (!match) {
    throw new UsageError("unsupported_network", `not an x402 network id: ${id}`);
  }
  return {
    family: match[1] === "tron" ? "tron" : "evm",
    chainId: BigInt(match[2]!).toString(10),
  };
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
