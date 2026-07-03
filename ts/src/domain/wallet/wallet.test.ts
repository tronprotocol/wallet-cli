import { describe, it, expect } from "vitest";
import { walletAddress, accountIndices } from "./index.js";
import type { Wallet } from "../types/index.js";

const seedWallet: Wallet = {
  id: "wlt_s",
  source: {
    type: "seed",
    vaultId: "vlt_1",
    addresses: {
      "0": { tron: "Tron0" },
      "2": { tron: "Tron2" },
    },
  },
};

const pkWallet: Wallet = {
  id: "wlt_k",
  source: { type: "privateKey", keyId: "key_1", addresses: { tron: "TronK" } },
};

const ledgerWallet: Wallet = {
  id: "wlt_l",
  source: { type: "ledger", family: "tron", path: "m/44'/195'/0'/0/0", address: "TLedger" },
};

const watchWallet: Wallet = {
  id: "wlt_w",
  source: { type: "watch", family: "tron", address: "TWatch" },
};

describe("walletAddress", () => {
  it("reads a seed address by index and family", () => {
    expect(walletAddress(seedWallet, "tron", 2)).toBe("Tron2");
    expect(walletAddress(seedWallet, "tron", 0)).toBe("Tron0");
  });

  it("defaults a seed to its lowest known index when none is given", () => {
    expect(walletAddress(seedWallet, "tron")).toBe("Tron0");
  });

  it("returns undefined for an unknown seed index", () => {
    expect(walletAddress(seedWallet, "tron", 5)).toBeUndefined();
  });

  it("reads a flat privateKey address, ignoring index", () => {
    expect(walletAddress(pkWallet, "tron")).toBe("TronK");
    expect(walletAddress(pkWallet, "tron", 99)).toBe("TronK");
  });

  it("returns the ledger address only for the matching family", () => {
    expect(walletAddress(ledgerWallet, "tron")).toBe("TLedger");
    expect(walletAddress(ledgerWallet, "evm" as any)).toBeUndefined();
  });

  it("returns the watch address only for the matching family", () => {
    expect(walletAddress(watchWallet, "tron")).toBe("TWatch");
    expect(walletAddress(watchWallet, "evm" as any)).toBeUndefined();
  });
});

describe("accountIndices", () => {
  it("lists seed indices numerically sorted", () => {
    expect(accountIndices(seedWallet.source)).toEqual([0, 2]);
  });

  it("returns no indices for privateKey, ledger and watch", () => {
    expect(accountIndices(pkWallet.source)).toEqual([]);
    expect(accountIndices(ledgerWallet.source)).toEqual([]);
    expect(accountIndices(watchWallet.source)).toEqual([]);
  });
});
