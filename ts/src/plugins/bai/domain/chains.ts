import { isTxHash, type ChainFamily, type NetworkDescriptor } from "../../../plugin-api/domain.js";

export type BaiChain = "tron" | "bnb" | "base";

// The chain family of each B.AI recharge chain name.
const BAI_CHAIN_FAMILY: Readonly<Record<BaiChain, ChainFamily>> = {
  tron: "tron",
  bnb: "evm",
  base: "evm",
};

// The B.AI chain name of the network, when B.AI accepts recharges on it.
export function baiChain(network: NetworkDescriptor): BaiChain | undefined {
  if (network.family === "evm" && network.chainId === "56") return "bnb";
  if (network.family === "evm" && network.chainId === "8453") return "base";
  if (network.family === "tron" && network.chainId === "728126428") return "tron";
}

export function isBaiTxHash(chain: BaiChain, txHash: string): boolean {
  return isTxHash(BAI_CHAIN_FAMILY[chain], txHash);
}
