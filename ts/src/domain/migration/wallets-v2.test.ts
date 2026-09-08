import { describe, it, expect } from "vitest";
import { migrateWalletsToV2, walletsNeedPassword } from "./wallets-v2.js";
import { Derivation } from "../derivation/index.js";
import { evmAddressFromPublicKey } from "../address/index.js";
import type { ChainAddresses } from "../types/index.js";

const seedWallet = { id: "wlt_s", source: { type: "seed", vaultId: "v1", addresses: {} } };
const pkWallet = { id: "wlt_k", source: { type: "privateKey", keyId: "k1", addresses: {} } };
const ledgerWallet = {
  id: "wlt_l",
  source: {
    type: "ledger",
    family: "tron",
    nativeSymbol: "TRX",
    path: "m/44'/195'/0'/0/0",
    address: "T1",
  },
};
const watchWallet = {
  id: "wlt_w",
  source: { type: "watch", family: "tron", nativeSymbol: "TRX", address: "T2" },
};

describe("walletsNeedPassword", () => {
  // The migration re-runs the SAME derivation the creation path uses, so any source holding a
  // local secret must be decrypted. That is exactly SOURCE_KINDS[type].hasSecret — an exhaustive
  // registry, so a new source type is forced to answer rather than defaulting to "free".
  it.each([
    ["a seed wallet", seedWallet],
    ["a privateKey wallet", pkWallet],
  ])("is true for %s", (_label, wallet) => {
    expect(walletsNeedPassword({ version: 1, wallets: [wallet] })).toBe(true);
  });

  // ledger and watch hold no secret anywhere and are single-family by construction, so a
  // keystore made only of them still migrates with no prompt at all.
  it("is false when no wallet holds a local secret", () => {
    expect(walletsNeedPassword({ version: 1, wallets: [ledgerWallet, watchWallet] })).toBe(false);
  });

  it("is false for an empty keystore", () => {
    expect(walletsNeedPassword({ version: 1, wallets: [] })).toBe(false);
  });
});

// A real key pair: the two encodings of one public key (see domain/address tests).
const TRON_ADDR = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";
const EVM_ADDR = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";

const seed = Derivation.mnemonicToSeed(
  "test test test test test test test test test test test junk",
);
const PRIV_KEY = Derivation.derive(seed, "m/44'/195'/0'/0/0").privateKey;

const secrets = {
  seedFor: (vaultId: string) => {
    if (vaultId !== "v1") throw new Error(`unexpected vault ${vaultId}`);
    return seed;
  },
  keyFor: (keyId: string) => {
    if (keyId !== "k1") throw new Error(`unexpected key ${keyId}`);
    return PRIV_KEY;
  },
};

const noSecrets = {
  seedFor: (): never => {
    throw new Error("seed access must not be needed");
  },
  keyFor: (): never => {
    throw new Error("key access must not be needed");
  },
};

describe("migrateWalletsToV2 — privateKey", () => {
  // Both addresses come from the DECRYPTED key, the same way derivePrivAddresses builds them at
  // import time — not from re-encoding whatever the file happened to cache. A stale cached value
  // is therefore corrected, and no second statement of "how an EVM address is derived" exists.
  it("derives both addresses from the key, replacing a stale cached address", () => {
    const doc = {
      version: 1,
      wallets: [
        {
          id: "wlt_k",
          source: { type: "privateKey", keyId: "k1", addresses: { tron: "T-stale" } },
        },
      ],
    };

    const out = migrateWalletsToV2(doc, secrets);

    expect((out.wallets[0]!.source as { addresses: ChainAddresses }).addresses).toEqual({
      tron: TRON_ADDR,
      evm: EVM_ADDR,
    });
  });
});

describe("migrateWalletsToV2 — the untouched sources", () => {
  it("leaves ledger and watch accounts alone without touching any secret", () => {
    const ledger = {
      type: "ledger",
      family: "tron",
      nativeSymbol: "TRX",
      path: "m/44'/195'/0'/0/0",
      address: TRON_ADDR,
    };
    const watch = { type: "watch", family: "tron", nativeSymbol: "TRX", address: TRON_ADDR };
    const doc = {
      version: 1,
      wallets: [
        { id: "wlt_l", source: ledger },
        { id: "wlt_w", source: watch },
      ],
    };

    const out = migrateWalletsToV2(doc, noSecrets);

    expect(out.wallets[0]!.source).toEqual(ledger);
    expect(out.wallets[1]!.source).toEqual(watch);
  });

  it("stamps the new version", () => {
    expect(migrateWalletsToV2({ version: 1, wallets: [] }, noSecrets).version).toBe(2);
  });
});

describe("migrateWalletsToV2 — the seed path", () => {
  const docWithIndices = (indices: string[]) => ({
    version: 1,
    wallets: [
      {
        id: "wlt_s",
        source: {
          type: "seed",
          vaultId: "v1",
          addresses: Object.fromEntries(indices.map((i) => [i, { tron: `T-stale-${i}` }])),
        },
      },
    ],
  });

  const addressesOf = (out: { wallets: Array<{ source: unknown }> }) =>
    (out.wallets[0]!.source as { addresses: Record<string, ChainAddresses> }).addresses;

  // Verified constants for the test mnemonic: the two TRON templates disagree from index 1 on.
  const LEGACY_TRON_1 = "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ"; // m/44'/195'/1'/0/0
  const CURRENT_TRON_1 = "TPjjvMwjPoDC32V2dGDYTkLH4E5LAtBZ6C"; // m/44'/195'/0'/0/1
  const CURRENT_TRON_0 = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"; // m/44'/195'/0'/0/0
  const EVM_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // m/44'/60'/0'/0/1

  it("derives each known index's EVM address at m/44'/60'/0'/0/N", () => {
    const addresses = addressesOf(migrateWalletsToV2(docWithIndices(["0", "2"]), secrets));

    for (const index of ["0", "2"]) {
      expect(addresses[index]!.evm).toBe(
        evmAddressFromPublicKey(Derivation.derive(seed, `m/44'/60'/0'/0/${index}`).publicKey),
      );
    }
  });

  // Previously this asserted the cached TRON address was PRESERVED. Re-running the creation
  // path's derivation recomputes every family, so a cached value that NO template explains —
  // genuine corruption — is corrected: there is one derivation rule, and the file is brought
  // into line with it. The one exception is a value a legacy template explains (below).
  it("re-derives the TRON address too, correcting a value no template explains", () => {
    const addresses = addressesOf(migrateWalletsToV2(docWithIndices(["0"]), secrets));

    expect(addresses["0"]!.tron).toBe(CURRENT_TRON_0);
  });

  // The v1→v2 migration is the first code a 4.12.0 user meets, and 4.12.0 shipped `derive` on
  // the OLD TRON template. Re-deriving index >= 1 would replace the funded legacy address with
  // an address of a different key — after which every protection on this branch reads the
  // account as "current" and signs with the wrong key. The cached value is the only record of
  // which key owns the account, so it survives.
  it("keeps a cached TRON address that a legacy template explains", () => {
    const doc = {
      version: 1,
      wallets: [
        {
          id: "wlt_s",
          source: {
            type: "seed",
            vaultId: "v1",
            addresses: { "0": { tron: CURRENT_TRON_0 }, "1": { tron: LEGACY_TRON_1 } },
          },
        },
      ],
    };

    const addresses = addressesOf(migrateWalletsToV2(doc, secrets));

    expect(addresses["1"]!.tron).toBe(LEGACY_TRON_1);
    expect(addresses["1"]!.evm).toBe(EVM_1);
    expect(addresses["0"]!.tron).toBe(CURRENT_TRON_0);
  });

  // A wallet derived by this build caches the current address, which the current template
  // explains — nothing to preserve, and the migration behaves exactly as before.
  it("re-derives a cached TRON address the current template explains", () => {
    const doc = {
      version: 1,
      wallets: [
        {
          id: "wlt_s",
          source: { type: "seed", vaultId: "v1", addresses: { "1": { tron: CURRENT_TRON_1 } } },
        },
      ],
    };

    expect(addressesOf(migrateWalletsToV2(doc, secrets))["1"]!.tron).toBe(CURRENT_TRON_1);
  });

  it("decrypts each vault only once, however many indices it has", () => {
    let calls = 0;
    migrateWalletsToV2(docWithIndices(["0", "1", "2", "3"]), {
      ...secrets,
      seedFor: (id: string) => {
        calls += 1;
        return secrets.seedFor(id);
      },
    });

    expect(calls).toBe(1);
  });
});
