import { expect, it, vi } from "vitest";
import { BaiWalletBinding, baiChain } from "./bai-wallet-binding.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
it.each([
  ["evm", "56", "bnb"],
  ["evm", "8453", "base"],
  ["tron", "728126428", "tron"],
])("signs the official binding chain name for %s:%s", async (family, chainId, chain) => {
  const message = `Welcome to BAI !\nhttps://chat.bankofai.io wants you to confirm wallet binding for recharge:\npayer\n\nChain ID: ${chain}\nExpiration Time: 2026-09-17T10:05:00.000Z\nNonce: nonce`;
  const sign = vi.fn(async () => ({ address: "payer", message, signature: "signed" }));
  const bind = vi.fn(async () => ({ userId: "user", address: "payer", chain }));
  const scope = { activeAccount: "selected", emit: vi.fn() } as never;
  await new BaiWalletBinding(
    { sign },
    () => Date.parse("2026-09-17T10:00:00Z"),
    () => "nonce",
  ).bind(scope, { family, chainId } as NetworkDescriptor, "payer", { bind });
  expect(sign).toHaveBeenCalledWith(scope, family, "selected", message);
  expect(bind).toHaveBeenCalledWith({
    chain,
    address: "payer",
    message,
    signature: "signed",
    version: 2,
  });
});
it("does not bind if the user rejects the signature", async () => {
  const bind = vi.fn();
  const sign = vi.fn(async () => {
    throw new Error("rejected");
  });
  await expect(
    new BaiWalletBinding({ sign }).bind(
      { emit: vi.fn() } as never,
      { family: "tron", chainId: "728126428" } as NetworkDescriptor,
      "payer",
      { bind },
    ),
  ).rejects.toThrow("rejected");
  expect(bind).not.toHaveBeenCalled();
});
it.each([
  ["evm", "84532"],
  ["tron", "3448148188"],
  ["evm", "1"],
])("rejects unsupported %s:%s", (family, chainId) => {
  expect(baiChain({ family, chainId } as NetworkDescriptor)).toBeUndefined();
});
