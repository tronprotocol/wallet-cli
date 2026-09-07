import type { BaiBindingStore } from "../ports/bai-binding-store.js";
import type { BaiWalletBindingInput } from "../ports/bai-recharge.js";
import { UsageError } from "../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

export function baiChain(network: NetworkDescriptor): string {
  if (network.family === "evm" && network.chainId === "56") return "bnb";
  if (network.family === "evm" && network.chainId === "8453") return "base";
  if (network.family === "tron" && network.chainId === "728126428") return "tron";
  throw new UsageError(
    "unsupported_network_capability",
    "B.AI recharge supports TRON, BSC and Base mainnet",
  );
}

/** Setup only: recharge checks the persisted confirmation without making another API call. */
export class BaiCredentialSetup {
  constructor(
    private readonly store: BaiBindingStore,
    private readonly check: (apiKey: string, input: BaiWalletBindingInput) => Promise<boolean>,
  ) {}
  async confirm(apiKey: string, chain: string, address: string): Promise<void> {
    if (!apiKey.trim() || !chain || !address)
      throw new UsageError("invalid_value", "B.AI setup requires a credential and payer wallet");
    if (this.store.isConfirmed(apiKey, chain, address)) return;
    if (!(await this.check(apiKey, { chain, address }))) {
      throw new UsageError(
        "invalid_value",
        "The selected wallet is not bound to this B.AI account; complete binding before configuring the API key",
      );
    }
    this.store.confirm(apiKey, chain, address);
  }
}
