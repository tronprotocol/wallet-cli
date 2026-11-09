import { describe, it, expect } from "vitest";
import { parseWalletsFile } from "./wallets-file.js";

const TRON = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";
const EVM = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";

const valid = () => ({
  version: 2,
  activeAccount: "wlt_seed.0",
  wallets: [
    {
      id: "wlt_seed",
      source: { type: "seed", vaultId: "vlt_a", addresses: { "0": { tron: TRON, evm: EVM } } },
    },
    {
      id: "wlt_key",
      source: { type: "privateKey", keyId: "key_a", addresses: { tron: TRON, evm: EVM } },
    },
    {
      id: "wlt_led",
      source: { type: "ledger", family: "tron", path: "m/44'/195'/0'/0/0", address: TRON },
    },
    { id: "wlt_obs", source: { type: "watch", family: "evm", address: EVM.toLowerCase() } },
  ],
  labels: { "wlt_seed.0": "main", wlt_key: "hot" },
});

describe("parseWalletsFile", () => {
  it("accepts every source kind a write path stores", () => {
    expect(parseWalletsFile(valid())).toEqual(valid());
  });

  it("passes an unknown source kind through so a newer file stays readable", () => {
    const doc = valid();
    doc.wallets.push({ id: "wlt_new", source: { type: "future" } } as never);
    expect(parseWalletsFile(doc).wallets).toHaveLength(5);
  });

  it("accepts a stored label longer than a write allows today", () => {
    const doc = valid();
    doc.labels["wlt_key"] = "x".repeat(70);
    expect(() => parseWalletsFile(doc)).not.toThrow();
  });

  it.each<[string, (doc: ReturnType<typeof valid>) => void]>([
    [
      "an invalid watch address",
      (d) => ((d.wallets[3]!.source as any).address = "Tnot-an-address"),
    ],
    ["an address of the wrong family", (d) => ((d.wallets[2]!.source as any).address = EVM)],
    ["a missing cached EVM address", (d) => delete (d.wallets[1]!.source as any).addresses.evm],
    ["a non-numeric account index", (d) => ((d.wallets[0]!.source as any).addresses = { x: {} })],
    [
      "a vault id that leaves the keystore",
      (d) => ((d.wallets[0]!.source as any).vaultId = "../x"),
    ],
    ["a duplicate label ignoring case", (d) => (d.labels["wlt_key"] = " MAIN ")],
    ["a label with the reserved prefix", (d) => (d.labels["wlt_key"] = "wlt_x")],
    ["an empty label", (d) => (d.labels["wlt_key"] = "  ")],
    ["a wallet listed twice", (d) => d.wallets.push(d.wallets[1]!)],
    ["a wallet id that is not a wallet ref", (d) => (d.wallets[1]!.id = "wlt_a.1")],
  ])("rejects %s with encoding_error", (_label, mutate) => {
    const doc = valid();
    mutate(doc);
    expect(() => parseWalletsFile(doc)).toThrowError(
      expect.objectContaining({ code: "encoding_error" }),
    );
  });
});
