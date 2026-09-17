import { expect, it, vi } from "vitest";
import { BaiCredentialSetup } from "./bai-credential-setup.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
const unlock = vi.fn(async (_verify: (password: string) => boolean) => {});
const scope = { emit: vi.fn(), timeoutMs: 1000 } as unknown as TransactionScope;
import { baiChain, requireBaiChain } from "./bai-credential-setup.js";
import type { NetworkDescriptor, Wallet } from "../../domain/types/index.js";

function selectionFixture(selection: { network?: string; account?: string } = {}) {
  const network = { id: "eip155:8453", family: "evm", chainId: "8453" } as NetworkDescriptor;
  const networks = { resolve: vi.fn(() => network) };
  const wallet: Wallet = {
    id: "wlt_test",
    source: { type: "watch", family: "evm", address: "0x1111111111111111111111111111111111111111" },
  };
  const accounts = {
    verifyPassword: vi.fn(() => true),
    activeAccount: vi.fn((): string | null => "active"),
    resolveAccount: vi.fn(() => ({ wallet, index: 0 })),
  };
  const store = { isConfirmed: () => false, confirm: vi.fn() };
  const check = vi.fn(async () => true);
  const bind = vi.fn(async () => ({ userId: "user", address: "payer", chain: "eth" }));
  const sign = vi.fn(async (_scope, _family, _account, message: string) => ({
    address: "payer",
    message,
    signature: "signed",
  }));
  return {
    setup: new BaiCredentialSetup(
      store,
      () => ({ isBound: check, bind }),
      networks,
      accounts,
      { sign },
      selection,
      () => Date.parse("2026-09-17T10:00:00Z"),
      () => "0123456789abcdef0123456789abcdef",
    ),
    bind,
    sign,
    networks,
    accounts,
    store,
    check,
    network,
    wallet,
  };
}
it("resolves default network and active account inside the setup use case", async () => {
  const f = selectionFixture();
  await f.setup.execute("key", scope, unlock);
  expect(f.networks.resolve).toHaveBeenCalledWith(undefined);
  expect(f.accounts.resolveAccount).toHaveBeenCalledWith("active", "evm");
  expect(f.check).toHaveBeenCalledWith({
    chain: "base",
    address: f.wallet.source.type === "watch" ? f.wallet.source.address : "",
  });
});
it("honors explicit network and account without consulting the active account", async () => {
  const f = selectionFixture({ network: "base", account: "selected" });
  await f.setup.execute("key", scope, unlock);
  expect(f.networks.resolve).toHaveBeenCalledWith("base");
  expect(f.accounts.resolveAccount).toHaveBeenCalledWith("selected", "evm");
  expect(f.accounts.activeAccount).not.toHaveBeenCalled();
});
it("rejects missing accounts before contacting BAI", async () => {
  const f = selectionFixture();
  f.accounts.activeAccount.mockReturnValue(null);
  await expect(f.setup.execute("key", scope, unlock)).rejects.toMatchObject({
    code: "invalid_value",
  });
  expect(f.check).not.toHaveBeenCalled();
});
it("rejects a missing family address before contacting BAI", async () => {
  const f = selectionFixture();
  f.wallet.source = { type: "watch", family: "tron", address: "Ttest" };
  await expect(f.setup.execute("key", scope, unlock)).rejects.toMatchObject({
    code: "family_mismatch",
  });
  expect(f.check).not.toHaveBeenCalled();
});
it("uses one supported-network mapping and rejects testnet before accessing a wallet", async () => {
  const f = selectionFixture();
  Object.assign(f.network, { chainId: "84532", id: "eip155:84532" });
  expect(baiChain(f.network)).toBeUndefined();
  expect(() => requireBaiChain(f.network)).toThrow();
  await expect(f.setup.execute("key", scope, unlock)).rejects.toMatchObject({
    code: "unsupported_network_capability",
  });
  expect(f.accounts.resolveAccount).not.toHaveBeenCalled();
});
it.each([
  ["evm", "56", "bnb"],
  ["evm", "8453", "base"],
  ["tron", "728126428", "tron"],
  ["evm", "84532", undefined],
  ["tron", "3448148188", undefined],
  ["evm", "1", undefined],
])("maps BAI support for %s:%s", (family, chainId, expected) => {
  expect(baiChain({ family, chainId } as NetworkDescriptor)).toBe(expected);
});

it("signs and binds an unbound wallet before recording confirmation", async () => {
  const f = selectionFixture();
  f.check.mockResolvedValue(false);
  await f.setup.execute("key", scope, unlock);
  const address = f.wallet.source.type === "watch" ? f.wallet.source.address : "";
  const message = `Welcome to BAI !\nhttps://chat.bankofai.io wants you to confirm wallet binding for recharge:\n${address}\n\nChain ID: 8453\nExpiration Time: 2026-09-17T10:05:00.000Z\nNonce: 0123456789abcdef0123456789abcdef`;
  expect(f.sign).toHaveBeenCalledWith(scope, "evm", "wlt_test", message);
  expect(f.bind).toHaveBeenCalledWith({
    chain: "base",
    address,
    message,
    signature: "signed",
    version: 2,
  });
  expect(f.sign.mock.invocationCallOrder[0]).toBeLessThan(f.bind.mock.invocationCallOrder[0]!);
  expect(f.bind.mock.invocationCallOrder[0]).toBeLessThan(
    f.store.confirm.mock.invocationCallOrder[0]!,
  );
});
it("does not sign or bind an already bound wallet", async () => {
  const f = selectionFixture();
  await f.setup.execute("key", scope, unlock);
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.bind).not.toHaveBeenCalled();
  expect(f.store.confirm).toHaveBeenCalledOnce();
});
it("reuses local confirmation without API or signing", async () => {
  const f = selectionFixture();
  f.store.isConfirmed = () => true;
  await f.setup.execute("key", scope, unlock);
  expect(f.check).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});
it.each(["check", "sign", "bind"] as const)(
  "does not record confirmation when %s fails",
  async (step) => {
    const f = selectionFixture();
    f.check.mockResolvedValue(false);
    f[step].mockRejectedValue(new Error("failed"));
    await expect(f.setup.execute("key", scope, unlock)).rejects.toThrow("failed");
    expect(f.store.confirm).not.toHaveBeenCalled();
    if (step !== "bind") expect(f.bind).not.toHaveBeenCalled();
  },
);
