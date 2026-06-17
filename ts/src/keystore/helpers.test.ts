import { describe, it, expect } from "vitest";
import { walletAddress, accountIndices } from "./index.js";
import type { Wallet } from "../types/index.js";

const seedWallet: Wallet = {
  id: "wlt_s",
  source: {
    type: "seed",
    vaultId: "vlt_1",
    addresses: {
      "0": { tron: "Tron0", evm: "0xEvm0" },
      "2": { tron: "Tron2", evm: "0xEvm2" },
    },
  },
};

const pkWallet: Wallet = {
  id: "wlt_k",
  source: { type: "privateKey", keyId: "key_1", addresses: { tron: "TronK", evm: "0xEvmK" } },
};

const ledgerWallet: Wallet = {
  id: "wlt_l",
  source: { type: "ledger", family: "evm", path: "m/44'/60'/0'/0/0", address: "0xLedger" },
};

describe("walletAddress", () => {
  it("reads a seed address by index and family", () => {
    expect(walletAddress(seedWallet, "evm", 2)).toBe("0xEvm2");
    expect(walletAddress(seedWallet, "tron", 0)).toBe("Tron0");
  });

  it("defaults a seed to its lowest known index when none is given", () => {
    expect(walletAddress(seedWallet, "evm")).toBe("0xEvm0");
  });

  it("returns undefined for an unknown seed index", () => {
    expect(walletAddress(seedWallet, "evm", 5)).toBeUndefined();
  });

  it("reads a flat privateKey address, ignoring index", () => {
    expect(walletAddress(pkWallet, "evm")).toBe("0xEvmK");
    expect(walletAddress(pkWallet, "tron", 99)).toBe("TronK");
  });

  it("returns the ledger address only for the matching family", () => {
    expect(walletAddress(ledgerWallet, "evm")).toBe("0xLedger");
    expect(walletAddress(ledgerWallet, "tron")).toBeUndefined();
  });
});

describe("accountIndices", () => {
  it("lists seed indices numerically sorted", () => {
    expect(accountIndices(seedWallet.source)).toEqual([0, 2]);
  });

  it("returns no indices for privateKey and ledger", () => {
    expect(accountIndices(pkWallet.source)).toEqual([]);
    expect(accountIndices(ledgerWallet.source)).toEqual([]);
  });
});
