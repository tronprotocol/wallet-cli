import type { NetworkDescriptor } from "../types/index.js";
import { UsageError } from "../errors/index.js";

export function parseAgentId(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new UsageError("invalid_value", "agent id must be an unsigned decimal integer");
  }
  const id = BigInt(value);
  if (id >= 1n << 256n) throw new UsageError("invalid_value", "agent id must fit uint256");
  return id;
}

export function resolveAgentId(value: string, network: NetworkDescriptor): bigint {
  const parts = value.split(":");
  if (parts.length === 1) return parseAgentId(parts[0]!);
  let namespace: string;
  let chainId: string;
  let tokenId: string;
  if (parts.length === 2) {
    [chainId, tokenId] = parts as [string, string];
    namespace = network.id.split(":")[0]!;
  } else if (parts.length === 3) {
    [namespace, chainId, tokenId] = parts as [string, string, string];
    if (namespace !== "tron" && namespace !== "eip155") {
      throw new UsageError("invalid_value", `unknown Agent ID namespace: ${namespace}`);
    }
  } else {
    throw new UsageError("invalid_value", "agent id has too many components");
  }
  if (`${namespace}:${chainId}` !== network.id) {
    throw new UsageError(
      "invalid_value",
      `agent id belongs to ${namespace}:${chainId}, but selected network is ${network.id}`,
    );
  }
  return parseAgentId(tokenId);
}
