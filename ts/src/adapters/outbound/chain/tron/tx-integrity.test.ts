import { describe, expect, it, vi } from "vitest";
import { assertTronTxIntegrity } from "./tx-integrity.js";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

async function transaction() {
  const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
  vi.spyOn(tronweb.trx, "getCurrentRefBlockParams").mockResolvedValue({
    ref_block_bytes: "1234",
    ref_block_hash: "0011223344556677",
    expiration: 2_000_000,
    timestamp: 1_000_000,
  });
  return client.buildUpdateOriginEnergyLimit(OWNER, CONTRACT, 50_000_000, { permissionId: 2 });
}

describe("assertTronTxIntegrity txID binding", () => {
  it.each([
    ["lowercase", (id: string) => id],
    ["uppercase", (id: string) => id.toUpperCase()],
    ["0x-prefixed", (id: string) => `0x${id}`],
  ])("accepts the hash of raw_data_hex spelled %s", async (_label, spell) => {
    const tx = await transaction();
    expect(() => assertTronTxIntegrity({ ...tx, txID: spell(tx.txID) })).not.toThrow();
  });

  it.each([
    ["another hash", () => "ab".repeat(32)],
    ["a 0X prefix", (id: string) => `0X${id}`],
    ["a truncated id", (id: string) => id.slice(0, 62)],
    ["surrounding whitespace", (id: string) => ` ${id}`],
    ["an empty id", () => ""],
  ])("refuses %s", async (_label, spell) => {
    const tx = await transaction();
    expect(() => assertTronTxIntegrity({ ...tx, txID: spell(tx.txID) })).toThrow(
      expect.objectContaining({ code: "tx_integrity" }),
    );
  });
});
