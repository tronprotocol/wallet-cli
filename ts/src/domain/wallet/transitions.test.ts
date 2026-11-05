import { describe, expect, it } from "vitest";
import type { ChainAddresses, Wallet, WalletsFile } from "../types/index.js";
import {
  assignLabel,
  isHdWallet,
  nextAccountIndex,
  registerWallet,
  removeAccount,
  selectDerivedAccount,
  type HdWallet,
} from "./transitions.js";

const T0 = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const T1 = "TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa";
const E0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const E1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const A0: ChainAddresses = { tron: T0, evm: E0 };
const A1: ChainAddresses = { tron: T1, evm: E1 };

const emptyFile = (): WalletsFile => ({ version: 2, activeAccount: null, wallets: [], labels: {} });

const seedWallet = (id: string, addresses: Record<string, ChainAddresses> = { "0": A0 }) =>
  ({ id, source: { type: "seed", vaultId: `vlt_${id}`, addresses } }) as HdWallet;

describe("assignLabel", () => {
  it("stores the trimmed label", () => {
    const file = emptyFile();
    assignLabel(file, "wlt_a.0", "  main ");
    expect(file.labels).toEqual({ "wlt_a.0": "main" });
  });

  it("rejects a label another account holds, ignoring case", () => {
    const file = { ...emptyFile(), labels: { "wlt_a.0": "Main" } };
    expect(() => assignLabel(file, "wlt_b", "main")).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("lets an account keep its own label", () => {
    const file = { ...emptyFile(), labels: { "wlt_a.0": "main" } };
    assignLabel(file, "wlt_a.0", "MAIN");
    expect(file.labels["wlt_a.0"]).toBe("MAIN");
  });

  it("defaults to the next free wallet-<n>, counting the new wallet", () => {
    const file: WalletsFile = {
      ...emptyFile(),
      wallets: [seedWallet("wlt_a"), seedWallet("wlt_b")],
      labels: { "wlt_a.0": "wallet-2" },
    };
    assignLabel(file, "wlt_b.0");
    expect(file.labels["wlt_b.0"]).toBe("wallet-3");
  });
});

describe("registerWallet", () => {
  it("adds a new wallet, labels it, and selects its first account", () => {
    const file = emptyFile();
    expect(registerWallet(file, seedWallet("wlt_a"), "main")).toEqual({
      accountId: "wlt_a.0",
      created: true,
      changed: true,
    });
    expect(file.activeAccount).toBe("wlt_a.0");
    expect(file.labels["wlt_a.0"]).toBe("main");
  });

  it("selects the stored account a re-imported seed duplicates", () => {
    const file: WalletsFile = { ...emptyFile(), wallets: [seedWallet("wlt_a")] };
    const result = registerWallet(file, seedWallet("wlt_new"), "other");
    expect(result).toEqual({ accountId: "wlt_a.0", created: false, changed: true });
    expect(file.wallets).toHaveLength(1);
    expect(file.activeAccount).toBe("wlt_a.0");
  });

  it("keeps a seed distinct from a stored private key with the same address", () => {
    const key: Wallet = {
      id: "wlt_k",
      source: { type: "privateKey", keyId: "key_k", addresses: A0 },
    };
    const file: WalletsFile = { ...emptyFile(), wallets: [key] };
    expect(registerWallet(file, seedWallet("wlt_a"))).toMatchObject({ created: true });
  });

  it("adds a watch account without selecting it", () => {
    const file = { ...emptyFile(), activeAccount: "wlt_a.0" };
    const watch: Wallet = { id: "wlt_w", source: { type: "watch", family: "tron", address: T0 } };
    expect(registerWallet(file, watch)).toMatchObject({ accountId: "wlt_w", created: true });
    expect(file.activeAccount).toBe("wlt_a.0");
  });

  it("reports a duplicate watch account as needing no write", () => {
    const watch: Wallet = { id: "wlt_w", source: { type: "watch", family: "tron", address: T0 } };
    const file: WalletsFile = { ...emptyFile(), wallets: [watch], activeAccount: null };
    const again: Wallet = { ...watch, id: "wlt_x" };
    expect(registerWallet(file, again)).toEqual({
      accountId: "wlt_w",
      created: false,
      changed: false,
    });
    expect(file.activeAccount).toBeNull();
  });

  it("selects the stored Ledger account with the same family and path", () => {
    const ledger: Wallet = {
      id: "wlt_l",
      source: { type: "ledger", family: "tron", path: "m/44'/195'/0'/0/0", address: T0 },
    };
    const file: WalletsFile = { ...emptyFile(), wallets: [ledger] };
    expect(registerWallet(file, { ...ledger, id: "wlt_m" })).toEqual({
      accountId: "wlt_l",
      created: false,
      changed: true,
    });
    expect(file.activeAccount).toBe("wlt_l");
  });
});

describe("nextAccountIndex", () => {
  it("follows the highest stored index, not the count", () => {
    expect(nextAccountIndex(seedWallet("wlt_a", { "0": A0, "3": A1 }).source)).toBe(4);
  });

  it("is 0 for a wallet with no stored index", () => {
    expect(nextAccountIndex(seedWallet("wlt_a", {}).source)).toBe(0);
  });
});

describe("selectDerivedAccount", () => {
  it("stores a new slot, names it after the wallet's first account, and selects it", () => {
    const wallet = seedWallet("wlt_a");
    const file: WalletsFile = { ...emptyFile(), wallets: [wallet], labels: { "wlt_a.0": "main" } };
    expect(selectDerivedAccount(file, wallet, 1, A1)).toEqual({
      accountId: "wlt_a.1",
      created: true,
    });
    expect(wallet.source.addresses["1"]).toEqual(A1);
    expect(file.labels["wlt_a.1"]).toBe("main-1");
    expect(file.activeAccount).toBe("wlt_a.1");
  });

  it("selects an existing slot without renaming it", () => {
    const wallet = seedWallet("wlt_a", { "0": A0, "1": A1 });
    const file: WalletsFile = {
      ...emptyFile(),
      wallets: [wallet],
      labels: { "wlt_a.0": "main", "wlt_a.1": "savings" },
    };
    expect(selectDerivedAccount(file, wallet, 1, undefined)).toEqual({
      accountId: "wlt_a.1",
      created: false,
    });
    expect(file.labels["wlt_a.1"]).toBe("savings");
  });

  it("refuses a different label for an existing slot and points to rename", () => {
    const wallet = seedWallet("wlt_a", { "0": A0, "1": A1 });
    const file: WalletsFile = {
      ...emptyFile(),
      wallets: [wallet],
      labels: { "wlt_a.0": "main", "wlt_a.1": "savings" },
      activeAccount: "wlt_a.0",
    };
    expect(() => selectDerivedAccount(file, wallet, 1, undefined, "renamed")).toThrowError(
      expect.objectContaining({
        code: "invalid_value",
        message: expect.stringMatching(
          /'savings' already exists at index 1.*account-rename savings/,
        ),
      }),
    );
    expect(file.labels["wlt_a.1"]).toBe("savings");
    expect(file.activeAccount).toBe("wlt_a.0");
  });

  it("refuses a label for an existing slot that has none", () => {
    const wallet = seedWallet("wlt_a", { "0": A0, "1": A1 });
    const file: WalletsFile = { ...emptyFile(), wallets: [wallet] };
    expect(() => selectDerivedAccount(file, wallet, 1, undefined, "renamed")).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
    expect(file.labels).toEqual({});
  });

  it("selects an existing slot given its own label, ignoring case", () => {
    const wallet = seedWallet("wlt_a", { "0": A0, "1": A1 });
    const file: WalletsFile = {
      ...emptyFile(),
      wallets: [wallet],
      labels: { "wlt_a.1": "Savings" },
    };
    expect(selectDerivedAccount(file, wallet, 1, undefined, " savings ")).toEqual({
      accountId: "wlt_a.1",
      created: false,
    });
    expect(file.labels["wlt_a.1"]).toBe("Savings");
    expect(file.activeAccount).toBe("wlt_a.1");
  });
});

describe("isHdWallet", () => {
  it("accepts only seed wallets", () => {
    expect(isHdWallet(seedWallet("wlt_a"))).toBe(true);
    expect(
      isHdWallet({ id: "wlt_w", source: { type: "watch", family: "tron", address: T0 } }),
    ).toBe(false);
  });
});

describe("removeAccount", () => {
  const twoWallets = (): WalletsFile => ({
    ...emptyFile(),
    wallets: [seedWallet("wlt_a", { "0": A0, "1": A1 }), seedWallet("wlt_b", { "2": A1 })],
    labels: { "wlt_a.0": "main", "wlt_a.1": "sub", "wlt_b.2": "other" },
    activeAccount: "wlt_a.1",
  });

  it("removes one HD account and passes the active selection to the first wallet", () => {
    const file = twoWallets();
    expect(removeAccount(file, "wlt_a.1", "sub")).toEqual({
      accountId: "wlt_a.1",
      scope: "account",
      newActive: "wlt_a.0",
    });
    expect(file.wallets[0]!.source).toMatchObject({ addresses: { "0": A0 } });
    expect(file.labels).not.toHaveProperty("wlt_a.1");
  });

  it("removes the whole wallet when HD index 0 is named", () => {
    const file = twoWallets();
    const removal = removeAccount(file, "wlt_a.0", "main");
    expect(removal).toMatchObject({ accountId: "wlt_a", scope: "wallet", newActive: "wlt_b.2" });
    expect(removal.removedWallet?.id).toBe("wlt_a");
    expect(file.wallets.map((w) => w.id)).toEqual(["wlt_b"]);
    expect(Object.keys(file.labels)).toEqual(["wlt_b.2"]);
  });

  it("removes the wallet with its last HD account", () => {
    const file = twoWallets();
    const removal = removeAccount(file, "wlt_b.2", "other");
    expect(removal).toMatchObject({ accountId: "wlt_b.2", scope: "wallet", newActive: "wlt_a.1" });
    expect(removal.removedWallet?.id).toBe("wlt_b");
  });

  it("marks no secret file for removal for a wallet without a secret", () => {
    const watch: Wallet = { id: "wlt_w", source: { type: "watch", family: "tron", address: T0 } };
    const file: WalletsFile = { ...emptyFile(), wallets: [watch], activeAccount: "wlt_w" };
    expect(removeAccount(file, "wlt_w", "watch")).toEqual({
      accountId: "wlt_w",
      scope: "wallet",
      newActive: null,
    });
  });

  it("rejects an unknown HD index or wallet", () => {
    expect(() => removeAccount(twoWallets(), "wlt_a.7", "wlt_a.7")).toThrowError(
      /unknown account wlt_a\.7/,
    );
    expect(() => removeAccount(twoWallets(), "wlt_zz", "wlt_zz")).toThrowError(
      /unknown wallet wlt_zz/,
    );
  });
});
