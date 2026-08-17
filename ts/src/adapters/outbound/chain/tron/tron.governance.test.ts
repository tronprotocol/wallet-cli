import { describe, expect, it, vi } from "vitest";
import { assertTronTxIntegrity } from "./tx-integrity.js";
import { TronRpcClient } from "./tron.js";

const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("TronRpcClient governance builders", () => {
  it("locally builds and integrity-binds a 50M origin energy limit", async () => {
    const client = new TronRpcClient("http://127.0.0.1:1");
    vi.spyOn(client.tronweb.trx, "getCurrentRefBlockParams").mockResolvedValue({
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      expiration: 2_000_000,
      timestamp: 1_000_000,
    });
    const transaction = await client.buildUpdateOriginEnergyLimit(OWNER, CONTRACT, 50_000_000, {
      permissionId: 2,
    });

    expect(transaction.raw_data.contract[0]).toMatchObject({
      type: "UpdateEnergyLimitContract",
      Permission_id: 2,
      parameter: { value: { origin_energy_limit: 50_000_000 } },
    });
    expect(() => assertTronTxIntegrity(transaction)).not.toThrow();
  });

  // Java's CLI can send int64 max here because it speaks protobuf over gRPC. We cannot: java-tron
  // rebuilds the contract from `raw_data` json on the non-visible broadcast path, and a numeric
  // STRING does not parse into the int64 field — the node then validates an empty message and
  // answers "Contract validate error : No contract!". Proven on Nile with one signed transaction and
  // identical raw_data_hex. A json number cannot hold int64 max exactly either, so the only honest
  // answer for such a value is to refuse it up front rather than emit a transaction the node will
  // reject, or silently set a rounded limit. Real limits are bounded by getTotalEnergyLimit (~1.8e11),
  // far below the safe-integer ceiling, so nothing reachable is lost.
  it("refuses an origin energy limit no json number can hold exactly", async () => {
    const client = new TronRpcClient("http://127.0.0.1:1");
    vi.spyOn(client.tronweb.trx, "getCurrentRefBlockParams").mockResolvedValue({
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      expiration: 2_000_000,
      timestamp: 1_000_000,
    });
    await expect(
      client.buildUpdateOriginEnergyLimit(OWNER, CONTRACT, "9223372036854775807"),
    ).rejects.toMatchObject({ code: "invalid_amount" });
  });

  it("builds and integrity-checks a proposal value above Number.MAX_SAFE_INTEGER", async () => {
    const client = new TronRpcClient("http://127.0.0.1:1");
    vi.spyOn(client.tronweb.trx, "getCurrentRefBlockParams").mockResolvedValue({
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      expiration: 2_000_000,
      timestamp: 1_000_000,
    });
    const transaction = await client.buildProposalCreate(OWNER, [
      { key: 17, value: "9223372036854775807" },
    ]);

    const value = transaction.raw_data.contract[0]!.parameter.value as unknown as {
      parameters: Array<{ value: unknown }>;
    };
    expect(value.parameters[0]!.value).toBe("9223372036854775807");
    expect(() => assertTronTxIntegrity(transaction)).not.toThrow();
  });
});
