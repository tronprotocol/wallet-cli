import { describe, expect, it } from "vitest";
import { refreshTransactionIdentity } from "./transaction-codec.js";

const OWNER = "411111111111111111111111111111111111111111";
const STALE = "41dead00000000000000000000000000000000beef";

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    visible: false,
    txID: "",
    raw_data_hex: "",
    contract_address: STALE,
    raw_data: {
      contract: [
        {
          type: "CreateSmartContract",
          parameter: {
            type_url: "type.googleapis.com/protocol.CreateSmartContract",
            value: {
              owner_address: OWNER,
              new_contract: {
                origin_address: OWNER,
                abi: { entrys: [] },
                bytecode: "6080604052",
                consume_user_resource_percent: 100,
                origin_energy_limit: 10_000_000,
              },
            },
          },
        },
      ],
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      timestamp: 1_900_000_000_000,
      expiration: 1_900_000_060_000,
      fee_limit: 1_000_000_000,
      ...overrides,
    },
  };
}

describe("refreshTransactionIdentity — deployment address", () => {
  it("re-derives contract_address from the refreshed txID", () => {
    const refreshed = refreshTransactionIdentity(deployment());
    // 41 ‖ keccak256(txID ‖ owner_address)[12..] — the rule java-tron applies on execution.
    expect(refreshed.contract_address).toMatch(/^41[0-9a-f]{40}$/);
    expect(refreshed.contract_address).not.toBe(STALE);
  });

  it("moves the address whenever the mutation moves the txID", () => {
    const base = refreshTransactionIdentity(deployment());
    const rebound = refreshTransactionIdentity({
      ...deployment(),
      raw_data: {
        ...deployment().raw_data,
        contract: [{ ...deployment().raw_data.contract[0]!, Permission_id: 2 }],
        expiration: 1_900_086_400_000,
      },
    });
    expect(rebound.txID).not.toBe(base.txID);
    expect(rebound.contract_address).not.toBe(base.contract_address);
  });

  it("leaves transactions that carry no deployment address untouched", () => {
    const { contract_address: _omitted, ...withoutAddress } = deployment();
    expect(refreshTransactionIdentity(withoutAddress).contract_address).toBeUndefined();
  });

  it("refuses to derive an address when the owner is absent", () => {
    const broken = deployment();
    delete (broken.raw_data.contract[0]!.parameter.value as { owner_address?: string })
      .owner_address;
    expect(() => refreshTransactionIdentity(broken)).toThrowError(/owner_address/);
  });
});
