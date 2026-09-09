import { expect, it, vi } from "vitest";
import { BaiCredentialSetup } from "./bai-credential-setup.js";

it("checks the selected key and payer once, then reuses local confirmation", async () => {
  const verified = new Set<string>();
  const store = {
    isConfirmed: (key: string, chain: string, address: string) =>
      verified.has(JSON.stringify([key, chain, address])),
    confirm: (key: string, chain: string, address: string) => {
      verified.add(JSON.stringify([key, chain, address]));
    },
  };
  const check = vi.fn(async () => true);
  const setup = new BaiCredentialSetup(
    store,
    check,
    {
      resolve: () => {
        throw new Error("unused");
      },
    },
    {
      activeAccount: () => null,
      resolveAccount: () => {
        throw new Error("unused");
      },
    },
  );
  await setup.confirm("key", "bnb", "payer");
  await setup.confirm("key", "bnb", "payer");
  expect(check).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledWith("key", { chain: "bnb", address: "payer" });
  await setup.confirm("different-key", "bnb", "payer");
  await setup.confirm("key", "bnb", "different-payer");
  await setup.confirm("key", "tron", "payer");
  expect(check).toHaveBeenCalledTimes(4);
});
it.each([false, new Error("unavailable")])(
  "does not record failed confirmation",
  async (result) => {
    const store = { isConfirmed: () => false, confirm: vi.fn() };
    const check = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    await expect(
      new BaiCredentialSetup(
        store,
        check,
        {
          resolve: () => {
            throw new Error("unused");
          },
        },
        {
          activeAccount: () => null,
          resolveAccount: () => {
            throw new Error("unused");
          },
        },
      ).confirm("key", "bnb", "payer"),
    ).rejects.toThrow();
    expect(store.confirm).not.toHaveBeenCalled();
  },
);

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
    activeAccount: vi.fn((): string | null => "active"),
    resolveAccount: vi.fn(() => ({ wallet, index: 0 })),
  };
  const store = { isConfirmed: () => false, confirm: vi.fn() };
  const check = vi.fn(async () => true);
  return {
    setup: new BaiCredentialSetup(store, check, networks, accounts, selection),
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
  await f.setup.execute("key");
  expect(f.networks.resolve).toHaveBeenCalledWith(undefined);
  expect(f.accounts.resolveAccount).toHaveBeenCalledWith("active", "evm");
  expect(f.check).toHaveBeenCalledWith("key", {
    chain: "base",
    address: f.wallet.source.type === "watch" ? f.wallet.source.address : "",
  });
});
it("honors explicit network and account without consulting the active account", async () => {
  const f = selectionFixture({ network: "base", account: "selected" });
  await f.setup.execute("key");
  expect(f.networks.resolve).toHaveBeenCalledWith("base");
  expect(f.accounts.resolveAccount).toHaveBeenCalledWith("selected", "evm");
  expect(f.accounts.activeAccount).not.toHaveBeenCalled();
});
it("rejects missing accounts before contacting BAI", async () => {
  const f = selectionFixture();
  f.accounts.activeAccount.mockReturnValue(null);
  await expect(f.setup.execute("key")).rejects.toMatchObject({ code: "invalid_value" });
  expect(f.check).not.toHaveBeenCalled();
});
it("rejects a missing family address before contacting BAI", async () => {
  const f = selectionFixture();
  f.wallet.source = { type: "watch", family: "tron", address: "Ttest" };
  await expect(f.setup.execute("key")).rejects.toMatchObject({ code: "family_mismatch" });
  expect(f.check).not.toHaveBeenCalled();
});
it("uses one supported-network mapping and rejects testnet before accessing a wallet", async () => {
  const f = selectionFixture();
  Object.assign(f.network, { chainId: "84532", id: "eip155:84532" });
  expect(baiChain(f.network)).toBeUndefined();
  expect(() => requireBaiChain(f.network)).toThrow();
  await expect(f.setup.execute("key")).rejects.toMatchObject({
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
