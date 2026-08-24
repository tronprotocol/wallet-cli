import { describe, it, expect } from "vitest";
import { Derivation } from "../derivation/index.js";
import {
  TronAddress,
  evmAddressFromPublicKey,
  evmChecksumAddress,
  tronAddressBytes,
} from "../address/index.js";
import {
  walletAddress,
  accountIndices,
  deriveSeedAddresses,
  derivePrivAddresses,
} from "./index.js";
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

describe("address derivation covers every family", () => {
  const MNEMONIC = "test test test test test test test test test test test junk";
  const seed = Derivation.mnemonicToSeed(MNEMONIC);

  it("derives a seed account at each family's own template", () => {
    const addresses = deriveSeedAddresses(seed, 2);

    expect(addresses.tron).toBe(
      new TronAddress().fromPublicKey(Derivation.derive(seed, "m/44'/195'/2'/0/0").publicKey),
    );
    expect(addresses.evm).toBe(
      evmAddressFromPublicKey(Derivation.derive(seed, "m/44'/60'/0'/0/2").publicKey),
    );
  });

  // A privateKey account is ONE key wearing two encodings, which is why derivePrivAddresses
  // feeds the same public key to every family codec. (The migration deliberately does NOT
  // exploit this to skip decryption — see ADR-0008.)
  it("derives a private-key account's two addresses from the same key", () => {
    const priv = Derivation.derive(seed, "m/44'/195'/0'/0/0").privateKey;
    const addresses = derivePrivAddresses(priv);

    expect(evmChecksumAddress(tronAddressBytes(addresses.tron).slice(1))).toBe(addresses.evm);
  });
});
