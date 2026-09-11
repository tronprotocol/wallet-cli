import type { NetworkRegistry } from "../ports/network-registry.js";
import type { AccountStore } from "../ports/account-store.js";
import { walletAddress } from "../../domain/wallet/index.js";
import type { BaiBindingStore } from "../ports/bai-binding-store.js";
import type { BaiWalletBindingInput } from "../ports/bai-recharge.js";
import { UsageError } from "../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

export function baiChain(network: NetworkDescriptor): string | undefined {
  if (network.family === "evm" && network.chainId === "56") return "bnb";
  if (network.family === "evm" && network.chainId === "8453") return "base";
  if (network.family === "tron" && network.chainId === "728126428") return "tron";
}

export function requireBaiChain(network: NetworkDescriptor): string {
  const chain = baiChain(network);
  if (chain) return chain;
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
    private readonly networks: Pick<NetworkRegistry, "resolve">,
    private readonly accounts: Pick<AccountStore, "activeAccount" | "resolveAccount">,
    private readonly selection: { network?: string; account?: string } = {},
  ) {}

  async execute(apiKey: string): Promise<void> {
    const network = this.networks.resolve(this.selection.network);
    const chain = requireBaiChain(network);
    const account = this.selection.account ?? this.accounts.activeAccount();
    if (!account)
      throw new UsageError(
        "invalid_value",
        "Select a payer wallet before configuring the B.AI API key",
      );
    const selected = this.accounts.resolveAccount(account, network.family);
    const address = walletAddress(selected.wallet, network.family, selected.index);
    if (!address)
      throw new UsageError("family_mismatch", "Selected wallet has no address for this network");
    await this.confirm(apiKey, chain, address);
  }
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
