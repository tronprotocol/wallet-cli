import { randomBytes } from "node:crypto";
import { SOURCE_KINDS } from "../../domain/sources/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { MessageService } from "./message-service.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import type { AccountStore } from "../ports/account-store.js";
import { accountRef, walletAddress } from "../../domain/wallet/index.js";
import type { BaiBindingStore } from "../ports/bai-binding-store.js";
import type { BaiRechargeApi } from "../ports/bai-recharge.js";
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
    private readonly api: (apiKey: string) => Pick<BaiRechargeApi, "isBound" | "bind">,
    private readonly networks: Pick<NetworkRegistry, "resolve">,
    private readonly accounts: Pick<
      AccountStore,
      "activeAccount" | "resolveAccount" | "verifyPassword"
    >,
    private readonly messages: Pick<MessageService, "sign">,
    private readonly selection: { network?: string; account?: string } = {},
    private readonly now: () => number = Date.now,
    private readonly nonce: () => string = () => randomBytes(16).toString("hex"),
  ) {}

  async execute(
    apiKey: string,
    scope: TransactionScope,
    unlock: (verify: (password: string) => boolean) => Promise<void>,
  ): Promise<void> {
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
    if (!apiKey.trim())
      throw new UsageError("invalid_value", "B.AI setup requires a credential and payer wallet");
    if (this.store.isConfirmed(apiKey, chain, address)) return;
    const api = this.api(apiKey);
    scope.emit({ type: "activity", message: "Checking B.AI wallet binding…" });
    if (!(await api.isBound({ chain, address }))) {
      if (selected.wallet.source.type === "seed" || selected.wallet.source.type === "privateKey")
        await unlock((password) => this.accounts.verifyPassword(password));
      const message =
        "Welcome to BAI !\nhttps://chat.bankofai.io wants you to confirm wallet binding for recharge:\n" +
        `${address}\n\nChain ID: ${network.chainId}\n` +
        `Expiration Time: ${new Date(this.now() + 5 * 60_000).toISOString()}\nNonce: ${this.nonce()}`;
      scope.emit({
        type: "activity",
        message: "Wallet is not bound; signing the B.AI binding message…",
      });
      const ref = accountRef(
        selected.wallet.id,
        SOURCE_KINDS[selected.wallet.source.type].isHD ? selected.index : null,
      );
      const signed = await this.messages.sign(scope, network.family, ref, message);
      scope.emit({ type: "activity", message: "Binding the selected wallet to B.AI…" });
      await api.bind({ chain, address, message, signature: signed.signature, version: 2 });
    }
    this.store.confirm(apiKey, chain, address);
  }
}
