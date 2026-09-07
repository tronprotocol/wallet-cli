/**
 * x402 network identifiers.
 *
 * x402 addresses a chain by CAIP-2. For `eip155` that is the EIP-155 chain id in decimal — the
 * same string `NetworkDescriptor.chainId` already carries. For TRON, CAIP-2 uses the chain id in
 * HEXADECIMAL (`tron:0x2b6653dc`) while wallet-cli's canonical id uses decimal
 * (`tron:728126428`); the two name the same number in different bases.
 *
 * Pure: no registry lookup, no I/O. Whether a parsed id corresponds to a network this wallet is
 * configured for is the NetworkRegistry's question, not this module's.
 */
import type { ChainFamily } from "../family/chain-family.js";
import { UsageError } from "../errors/index.js";

export interface X402NetworkIdentity {
  family: ChainFamily;
  /** decimal, matching NetworkDescriptor.chainId. */
  chainId: string;
}

/** `tron:<hex>` or `eip155:<decimal>`; a hex reference is also accepted for eip155 so a
 *  round-trip never depends on which base a counterparty chose. */
const X402_ID = /^(tron|eip155):(0x[0-9a-f]+|[0-9]+)$/;

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
