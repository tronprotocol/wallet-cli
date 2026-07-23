import { describe, expect, it } from "vitest";
import {
  decodeTransactionHex,
  encodeTransactionHex,
  normalizeTransactionHex,
} from "./transaction-codec.js";

const OWNER = "411111111111111111111111111111111111111111";
const OTHER = "412222222222222222222222222222222222222222";
const OPERATIONS = "00".repeat(32);
const SIGNATURE_A = "ab".repeat(65);
const SIGNATURE_B = "cd".repeat(65);

function fixture(type: string, value: Record<string, unknown>) {
  return {
    visible: false,
    raw_data: {
      contract: [{
        parameter: { value, type_url: `type.googleapis.com/protocol.${type}` },
        type,
        Permission_id: 2,
      }],
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      expiration: 1_900_000_000_000,
      timestamp: 1_899_999_000_000,
      fee_limit: 10_000_000,
    },
    signature: [SIGNATURE_A, SIGNATURE_B],
  };
}

const CASES: Array<[string, Record<string, unknown>]> = [
  ["AccountCreateContract", { owner_address: OWNER, account_address: OTHER }],
  ["AccountUpdateContract", { owner_address: OWNER, account_name: "41636d65205472656173757279" }],
  ["SetAccountIdContract", { owner_address: OWNER, account_id: "61636d652d74726561737572792d3031" }],
  ["TransferContract", { owner_address: OWNER, to_address: OTHER, amount: 123 }],
  ["TransferAssetContract", { owner_address: OWNER, to_address: OTHER, asset_name: "31303030303031", amount: 456 }],
  ["TriggerSmartContract", { owner_address: OWNER, contract_address: OTHER, data: "a9059cbb", call_value: 0 }],
  ["FreezeBalanceV2Contract", { owner_address: OWNER, frozen_balance: 1_000_000, resource: "ENERGY" }],
  ["UnfreezeBalanceV2Contract", { owner_address: OWNER, unfreeze_balance: 1_000_000, resource: "BANDWIDTH" }],
  ["WithdrawExpireUnfreezeContract", { owner_address: OWNER }],
  ["DelegateResourceContract", { owner_address: OWNER, receiver_address: OTHER, balance: 1_000_000, resource: "ENERGY", lock: true, lock_period: 86_400 }],
  ["UnDelegateResourceContract", { owner_address: OWNER, receiver_address: OTHER, balance: 1_000_000, resource: "BANDWIDTH" }],
  ["CancelAllUnfreezeV2Contract", { owner_address: OWNER }],
  ["VoteWitnessContract", { owner_address: OWNER, votes: [{ vote_address: OTHER, vote_count: 7 }] }],
  ["WithdrawBalanceContract", { owner_address: OWNER }],
  ["CreateSmartContract", {
    owner_address: OWNER,
    new_contract: {
      origin_address: OWNER,
      abi: { entrys: [] },
      bytecode: "60006000",
      call_value: 0,
      consume_user_resource_percent: 100,
      name: "Fixture",
      origin_energy_limit: 10_000_000,
    },
  }],
  ["AccountPermissionUpdateContract", {
    owner_address: OWNER,
    owner: { type: 0, id: 0, permission_name: "owner", threshold: 2, keys: [{ address: OWNER, weight: 1 }, { address: OTHER, weight: 1 }] },
    actives: [{ type: 2, id: 2, permission_name: "active", threshold: 1, operations: OPERATIONS, keys: [{ address: OWNER, weight: 1 }] }],
  }],
];

describe("TRON complete transaction hex codec", () => {
  it.each(CASES)("round-trips %s byte-for-byte", (type, value) => {
    const hex = encodeTransactionHex(fixture(type, value));
    const decoded = decodeTransactionHex(hex);

    expect(decoded.raw_data.contract).toHaveLength(1);
    expect(decoded.raw_data.contract[0]?.type).toBe(type);
    expect(decoded.raw_data.contract[0]?.Permission_id).toBe(2);
    expect(decoded.raw_data.expiration).toBe(1_900_000_000_000);
    expect(decoded.signature).toEqual([SIGNATURE_A, SIGNATURE_B]);
    expect(decoded.txID).toMatch(/^[0-9a-f]{64}$/);
    expect(encodeTransactionHex(decoded)).toBe(hex);
  });

  it("rejects malformed, oversized, and multi-contract inputs", () => {
    expect(() => normalizeTransactionHex("0xabc")).toThrowError(/even length/);
    expect(() => normalizeTransactionHex("zz")).toThrowError(/non-hex/);
    expect(() => normalizeTransactionHex("00".repeat(512 * 1024 + 1))).toThrowError(/512 KiB/);

    const transaction = fixture("TransferContract", { owner_address: OWNER, to_address: OTHER, amount: 1 });
    transaction.raw_data.contract.push(transaction.raw_data.contract[0]!);
    expect(() => encodeTransactionHex(transaction)).toThrowError(/exactly one contract/);
  });

  it("rejects forged identity fields and malformed signatures", () => {
    const transaction = fixture("TransferContract", { owner_address: OWNER, to_address: OTHER, amount: 1 });
    expect(() => encodeTransactionHex({ ...transaction, txID: "00".repeat(32) })).toThrowError(/txID does not match/);
    expect(() => encodeTransactionHex({ ...transaction, raw_data_hex: "00" })).toThrowError(/raw_data_hex does not match/);
    expect(() => encodeTransactionHex({ ...transaction, signature: ["aa"] })).toThrowError(/65 bytes/);
  });
});
