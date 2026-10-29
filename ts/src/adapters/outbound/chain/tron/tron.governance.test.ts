import { describe, expect, it, vi } from "vitest";
import { assertTronTxIntegrity } from "./tx-integrity.js";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("TronRpcClient governance builders", () => {
  it("locally builds and integrity-binds a 50M origin energy limit", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
    vi.spyOn(tronweb.trx, "getCurrentRefBlockParams").mockResolvedValue({
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

  it("refuses an origin energy limit no json number can hold exactly", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
    vi.spyOn(tronweb.trx, "getCurrentRefBlockParams").mockResolvedValue({
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
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
    vi.spyOn(tronweb.trx, "getCurrentRefBlockParams").mockResolvedValue({
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      expiration: 2_000_000,
      timestamp: 1_000_000,
    });
    const transaction = await client.buildProposalCreate(OWNER, [
      { key: 17, value: 9223372036854775807n },
    ]);

    const value = transaction.raw_data.contract[0]!.parameter!.value as unknown as {
      parameters: Array<{ value: unknown }>;
    };
    expect(value.parameters[0]!.value).toBe("9223372036854775807");
    expect(() => assertTronTxIntegrity(transaction)).not.toThrow();
  });
});

describe("TronRpcClient chain parameters", () => {
  it("passes safe integer values through and keeps an absent value absent", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
    // Protobuf JSON omits a zero value.
    vi.spyOn(tronweb.trx, "getChainParameters").mockResolvedValue([
      { key: "getEnergyFee", value: 100 },
      { key: "getAllowCreationOfContracts" },
    ] as never);
    await expect(client.getChainParameters()).resolves.toEqual([
      { key: "getEnergyFee", value: 100 },
      { key: "getAllowCreationOfContracts" },
    ]);
  });

  it.each([2 ** 53 + 2, 1.5, -1])("refuses a value it cannot prove exact: %s", async (value) => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
    vi.spyOn(tronweb.trx, "getChainParameters").mockResolvedValue([{ key: "getEnergyFee", value }]);
    await expect(client.getChainParameters()).rejects.toMatchObject({ code: "provider_error" });
  });
});
