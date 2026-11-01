import { describe, expect, it, vi } from "vitest";
import { assertTronTxIntegrity } from "./tx-integrity.js";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";
import { TronChainService } from "../../../../application/use-cases/tron/chain-service.js";
import { ChainFormatters } from "../../../inbound/cli/render/chain.js";

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

  it.each([2 ** 53 + 2, 1.5, "1.5", "abc"])(
    "refuses a value it cannot prove exact: %s",
    async (value) => {
      const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
      vi.spyOn(tronweb.trx, "getChainParameters").mockResolvedValue([
        { key: "getEnergyFee", value },
      ] as never);
      await expect(client.getChainParameters()).rejects.toMatchObject({ code: "provider_error" });
    },
  );

  it.each([-1, "-1"])("lists a negative value %j as the node reports it", async (value) => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
    vi.spyOn(tronweb.trx, "getChainParameters").mockResolvedValue([
      { key: "getRemoveThePowerOfTheGr", value },
      { key: "getEnergyFee", value: 100 },
    ] as never);
    await expect(client.getChainParameters()).resolves.toEqual([
      { key: "getRemoveThePowerOfTheGr", value: -1 },
      { key: "getEnergyFee", value: 100 },
    ]);
  });

  it.each(["getMultiSignFee", "getUpdateAccountPermissionFee"] as const)(
    "still refuses a negative %s used as a fee",
    async (key) => {
      const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
      vi.spyOn(tronweb.trx, "getChainParameters").mockResolvedValue([{ key, value: -1 }] as never);
      await expect(client[key]()).rejects.toMatchObject({ code: "provider_error" });
    },
  );
});

describe("chain params and chain prices with an inactive (-1) parameter", () => {
  const NILE = { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as never;

  function service() {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://127.0.0.1:1"));
    vi.spyOn(tronweb.trx, "getChainParameters").mockResolvedValue([
      { key: "getRemoveThePowerOfTheGr", value: -1 },
      { key: "getEnergyFee", value: 100 },
      { key: "getMemoFee", value: 1_000_000 },
    ] as never);
    tronweb.trx.getEnergyPrices = vi.fn(async () => "0:100,1670515200000:210") as never;
    tronweb.trx.getBandwidthPrices = vi.fn(async () => "0:10,1670515200000:1000") as never;
    return new TronChainService({ get: () => client } as never);
  }

  it("chain params lists the parameter and renders -1", async () => {
    const data = await service().params(NILE);
    expect(data.params).toContainEqual({ key: "getRemoveThePowerOfTheGr", value: -1, unit: "" });
    const text = ChainFormatters.chainParams(data);
    expect(text).toMatch(/\| getRemoveThePowerOfTheGr \| -1 +\|/);
    expect(text).toMatch(/\| getEnergyFee +\| 100 sun +\|/);
  });

  it("chain params --key renders -1", async () => {
    const data = await service().params(NILE, "getRemoveThePowerOfTheGr");
    expect(data).toEqual({ key: "getRemoveThePowerOfTheGr", value: -1, unit: "" });
    expect(ChainFormatters.chainParams(data)).toMatch(/Value\s+-1\b/);
  });

  it("chain prices ignores a negative parameter it does not use", async () => {
    await expect(service().prices(NILE)).resolves.toMatchObject({ memoFeeSun: "1000000" });
  });
});
