import { isTxHash, type ChainFamily } from "../family/index.js";

export type BaiChain = "tron" | "bnb" | "base";

// The chain family of each B.AI recharge chain name.
const BAI_CHAIN_FAMILY: Readonly<Record<BaiChain, ChainFamily>> = {
  tron: "tron",
  bnb: "evm",
  base: "evm",
};

export function isBaiTxHash(chain: BaiChain, txHash: string): boolean {
  return isTxHash(BAI_CHAIN_FAMILY[chain], txHash);
}
