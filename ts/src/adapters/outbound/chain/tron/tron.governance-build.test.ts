import { describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";
const CONTRACT = "TPgmqJ9ixVReY2Zc5FSYiC8qp4yZybbMhU";

function client() {
  const { client: c, tronweb: cTronweb } = withTronWeb(
    () => new TronRpcClient("https://node.invalid"),
  );
  cTronweb.trx.getCurrentRefBlockParams = vi.fn(async () => ({
    ref_block_bytes: "4b6b",
    ref_block_hash: "4ad4875499feb0de",
    expiration: 1786000000000,
    timestamp: 1785999940000,
  })) as never;
  return c;
}

const contractValue = (tx: unknown) =>
  (tx as { raw_data: { contract: Array<{ parameter: { value: Record<string, unknown> } }> } })
    .raw_data.contract[0]!.parameter.value;

// Non-visible JSON broadcast requires origin_energy_limit as a number, not a numeric string.
describe("TronRpcClient.buildUpdateOriginEnergyLimit", () => {
  it("puts origin_energy_limit in raw_data as a NUMBER when given a string", async () => {
    const tx = await client().buildUpdateOriginEnergyLimit(OWNER, CONTRACT, "12000000");
    const value = contractValue(tx);
    expect(typeof value.origin_energy_limit).toBe("number");
    expect(value.origin_energy_limit).toBe(12_000_000);
  });

  it("keeps a numeric input a number", async () => {
    const value = contractValue(
      await client().buildUpdateOriginEnergyLimit(OWNER, CONTRACT, 5_000_000),
    );
    expect(value.origin_energy_limit).toBe(5_000_000);
  });

  it("accepts a limit above tronweb's own 10,000,000 ceiling — the reason we build locally", async () => {
    const value = contractValue(
      await client().buildUpdateOriginEnergyLimit(OWNER, CONTRACT, "50000000"),
    );
    expect(value.origin_energy_limit).toBe(50_000_000);
  });

  it("refuses a limit no json number can hold exactly, rather than losing precision silently", async () => {
    await expect(
      client().buildUpdateOriginEnergyLimit(OWNER, CONTRACT, "9007199254740993"),
    ).rejects.toMatchObject({ code: "invalid_amount" });
  });

  it("still binds the addresses and emits a self-consistent txID / raw_data_hex", async () => {
    const tx = (await client().buildUpdateOriginEnergyLimit(
      OWNER,
      CONTRACT,
      "12000000",
    )) as unknown as {
      txID: string;
      raw_data_hex: string;
    };
    const value = contractValue(tx);
    expect(value.owner_address).toBe("418c7145112ac207cc95544a930c769d468d01cd4e");
    expect(value.contract_address).toBe("419676189bf6a884aeb297c2447e890326aa074502");
    expect(tx.txID).toMatch(/^[0-9a-f]{64}$/);
    expect(tx.raw_data_hex).toContain("18"); // field 3 varint tag
    expect(tx.raw_data_hex.startsWith("0a")).toBe(true);
  });
});
