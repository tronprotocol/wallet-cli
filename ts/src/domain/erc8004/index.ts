import type { NetworkDescriptor } from "../types/index.js";
import { UsageError } from "../errors/index.js";

export const ERC8004_IDENTITY_REGISTRIES: Readonly<Record<string, string>> = {
  "eip155:56": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  "eip155:97": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  "tron:728126428": "TFLvivMdKsk6v2GrwyD2apEr9dU1w7p7Fy",
  "tron:3448148188": "TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5",
  "tron:2494104990": "TH775ZzfJ5V25EZkFuX6SkbAP53ykXTcma",
};

export function identityRegistryFor(network: NetworkDescriptor): string {
  const address = ERC8004_IDENTITY_REGISTRIES[network.id];
  if (!address) {
    throw new UsageError(
      "unsupported_network_capability",
      `ERC-8004 Identity Registry is not deployed on ${network.id}`,
    );
  }
  return address;
}

export function parseAgentId(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new UsageError("invalid_value", "agent id must be an unsigned decimal integer");
  }
  return BigInt(value);
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
