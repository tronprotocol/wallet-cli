import { assertSubmitAdmitted, submitDispatchCheck } from "../../../../plugin-api/application.js";
import { randomBytes } from "node:crypto";
import type { PluginSigningService, TransactionScope } from "../../../../plugin-api/application.js";
import type { BaiRechargeApi } from "../ports/bai-recharge.js";
import { UsageError } from "../../../../plugin-api/domain.js";
import type { NetworkDescriptor } from "../../../../plugin-api/domain.js";
import { baiChain } from "../../domain/chains.js";

export function requireBaiChain(network: NetworkDescriptor): string {
  const chain = baiChain(network);
  if (chain) return chain;
  throw new UsageError(
    "unsupported_network_capability",
    "B.AI recharge supports TRON, BSC and Base mainnet",
  );
}

// Caller must check live binding status and signing credentials first.
export class BaiWalletBinding {
  constructor(
    private readonly signing: Pick<PluginSigningService, "sign">,
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
    const signature = await this.signing.sign(scope, {
      network,
      family: network.family,
      payload: { kind: "message", message },
    });
    scope.emit({ type: "activity", message: "Binding the selected wallet to B.AI…" });
    assertSubmitAdmitted(scope.deadline);
    await api.bind(
      { chain, address, message, signature, version: 2 },
      submitDispatchCheck(scope.deadline),
    );
  }
}
