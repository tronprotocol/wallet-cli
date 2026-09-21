import { randomBytes } from "node:crypto";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { MessageService } from "./message-service.js";
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

/** Signs only after recharge has checked the live binding status and signing credentials. */
export class BaiWalletBinding {
  constructor(
    private readonly messages: Pick<MessageService, "sign">,
    private readonly now: () => number = Date.now,
    private readonly nonce: () => string = () => randomBytes(16).toString("hex"),
  ) {}

  async bind(
    scope: TransactionScope,
    network: NetworkDescriptor,
    address: string,
    api: Pick<BaiRechargeApi, "bind">,
  ): Promise<void> {
    // B.AI signs its chain name (tron/bnb/base), not the numeric blockchain ID.
    const chain = requireBaiChain(network);
    const message =
      "Welcome to BAI !\nhttps://chat.bankofai.io wants you to confirm wallet binding for recharge:\n" +
      `${address}\n\nChain ID: ${chain}\n` +
      `Expiration Time: ${new Date(this.now() + 5 * 60_000).toISOString()}\nNonce: ${this.nonce()}`;
    scope.emit({
      type: "activity",
      message: "Wallet is not bound; signing the B.AI binding message…",
    });
    const signed = await this.messages.sign(scope, network.family, scope.activeAccount, message);
    scope.emit({ type: "activity", message: "Binding the selected wallet to B.AI…" });
    await api.bind({ chain, address, message, signature: signed.signature, version: 2 });
  }
}
