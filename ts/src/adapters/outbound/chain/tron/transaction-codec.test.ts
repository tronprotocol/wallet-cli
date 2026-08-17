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
      contract: [
        {
          parameter: { value, type_url: `type.googleapis.com/protocol.${type}` },
          type,
          Permission_id: 2,
        },
      ],
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
  [
    "SetAccountIdContract",
    { owner_address: OWNER, account_id: "61636d652d74726561737572792d3031" },
  ],
  ["TransferContract", { owner_address: OWNER, to_address: OTHER, amount: 123 }],
  [
    "TransferAssetContract",
    { owner_address: OWNER, to_address: OTHER, asset_name: "31303030303031", amount: 456 },
  ],
  [
    "TriggerSmartContract",
    { owner_address: OWNER, contract_address: OTHER, data: "a9059cbb", call_value: 0 },
  ],
  [
    "FreezeBalanceV2Contract",
    { owner_address: OWNER, frozen_balance: 1_000_000, resource: "ENERGY" },
  ],
  [
    "UnfreezeBalanceV2Contract",
    { owner_address: OWNER, unfreeze_balance: 1_000_000, resource: "BANDWIDTH" },
  ],
  ["WithdrawExpireUnfreezeContract", { owner_address: OWNER }],
  [
    "DelegateResourceContract",
    {
      owner_address: OWNER,
      receiver_address: OTHER,
      balance: 1_000_000,
      resource: "ENERGY",
      lock: true,
      lock_period: 86_400,
    },
  ],
  [
    "UnDelegateResourceContract",
    { owner_address: OWNER, receiver_address: OTHER, balance: 1_000_000, resource: "BANDWIDTH" },
  ],
  ["CancelAllUnfreezeV2Contract", { owner_address: OWNER }],
  [
    "VoteWitnessContract",
    { owner_address: OWNER, votes: [{ vote_address: OTHER, vote_count: 7 }] },
  ],
  ["WithdrawBalanceContract", { owner_address: OWNER }],
  [
    "CreateSmartContract",
    {
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
    },
  ],
  [
    "AccountPermissionUpdateContract",
    {
      owner_address: OWNER,
      owner: {
        type: 0,
        id: 0,
        permission_name: "owner",
        threshold: 2,
        keys: [
          { address: OWNER, weight: 1 },
          { address: OTHER, weight: 1 },
        ],
      },
      actives: [
        {
          type: 2,
          id: 2,
          permission_name: "active",
          threshold: 1,
          operations: OPERATIONS,
          keys: [{ address: OWNER, weight: 1 }],
        },
      ],
    },
  ],
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

  // TronLink returns protobuf enums as their numeric value (`"resource": 1`), which TronWeb's
  // encoder does not understand — it drops the field silently, so the re-encoded bytes disagree
  // with the provider's own raw_data_hex and the record is refused as forged. Regression fixture:
  // a real Nile record from walletadapter.org (tx 0b1dddd1…), whose raw_data_hex carries `1801`.
  it("encodes numeric protobuf enum values exactly like their names", () => {
    const ENUM_CASES: Array<[string, Record<string, unknown>]> = [
      ["FreezeBalanceV2Contract", { owner_address: OWNER, frozen_balance: 1_000_000 }],
      ["UnfreezeBalanceV2Contract", { owner_address: OWNER, unfreeze_balance: 1_000_000 }],
      ["DelegateResourceContract", { owner_address: OWNER, receiver_address: OTHER, balance: 1 }],
      ["UnDelegateResourceContract", { owner_address: OWNER, receiver_address: OTHER, balance: 1 }],
    ];
    for (const [type, value] of ENUM_CASES) {
      for (const [numeric, name] of [
        [0, "BANDWIDTH"],
        [1, "ENERGY"],
        [2, "TRON_POWER"],
      ] as const) {
        expect(encodeTransactionHex(fixture(type, { ...value, resource: numeric }))).toBe(
          encodeTransactionHex(fixture(type, { ...value, resource: name })),
        );
      }
    }

    const record = {
      raw_data: {
        ref_block_bytes: "24de",
        ref_block_hash: "77c5c5a6f49382a0",
        expiration: 1_777_333_304_165,
        timestamp: 1_777_246_904_164,
        contract: [
          {
            type: "FreezeBalanceV2Contract",
            parameter: {
              value: {
                resource: 1,
                frozen_balance: 1_000_000,
                owner_address: "41c609440004050caaf57e8a7fa30fcd142bf5d17f",
              },
              type_url: "type.googleapis.com/protocol.FreezeBalanceV2Contract",
            },
          },
        ],
      },
      raw_data_hex:
        "0a0224de220877c5c5a6f49382a040e5f6c78add335a59083612550a3474797065" +
        "2e676f6f676c65617069732e636f6d2f70726f746f636f6c2e467265657a6542616c616e6365" +
        "5632436f6e7472616374121d0a1541c609440004050caaf57e8a7fa30fcd142bf5d17f10c084" +
        "3d180170e4beaee1dc33",
    };
    const decoded = decodeTransactionHex(encodeTransactionHex(record));
    expect(decoded.txID).toBe("0b1dddd111cd238497dcc5baf1adb5f3b3cdff22134c29278749a64ca79049c2");
    expect(decoded.raw_data.contract[0]?.parameter?.value?.resource).toBe("ENERGY");
  });

  it("rejects malformed, oversized, and multi-contract inputs", () => {
    expect(() => normalizeTransactionHex("0xabc")).toThrowError(/even length/);
    expect(() => normalizeTransactionHex("zz")).toThrowError(/non-hex/);
    expect(() => normalizeTransactionHex("00".repeat(512 * 1024 + 1))).toThrowError(/512 KiB/);

    const transaction = fixture("TransferContract", {
      owner_address: OWNER,
      to_address: OTHER,
      amount: 1,
    });
    transaction.raw_data.contract.push(transaction.raw_data.contract[0]!);
    expect(() => encodeTransactionHex(transaction)).toThrowError(/exactly one contract/);
  });

  it("rejects forged identity fields and malformed signatures", () => {
    const transaction = fixture("TransferContract", {
      owner_address: OWNER,
      to_address: OTHER,
      amount: 1,
    });
    expect(() => encodeTransactionHex({ ...transaction, txID: "00".repeat(32) })).toThrowError(
      /txID does not match/,
    );
    expect(() => encodeTransactionHex({ ...transaction, raw_data_hex: "00" })).toThrowError(
      /raw_data_hex does not match/,
    );
    expect(() => encodeTransactionHex({ ...transaction, signature: ["aa"] })).toThrowError(
      /65 bytes/,
    );
  });

  // TronWeb's deserializer rejects these four by name, so an artifact carrying one can never satisfy
  // the raw_data round-trip. They are refused either way — but a named type produces an actionable
  // message, so type 51 belongs in the table even though it will never decode.
  it("names the undecodable contract types instead of reporting an unknown id", () => {
    const transaction = fixture("TransferContract", {
      owner_address: OWNER,
      to_address: OTHER,
      amount: 1,
    });
    const hex = encodeTransactionHex({ ...transaction, signature: undefined });
    const proto = (
      globalThis as unknown as {
        TronWebProto: {
          Transaction: {
            deserializeBinary(b: Uint8Array): {
              getRawData(): { getContractList(): Array<{ setType(id: number): void }> };
              serializeBinary(): Uint8Array;
            };
          };
        };
      }
    ).TronWebProto.Transaction;

    const retyped = (id: number): string => {
      const pb = proto.deserializeBinary(Uint8Array.from(Buffer.from(hex, "hex")));
      pb.getRawData().getContractList()[0]!.setType(id);
      return Buffer.from(pb.serializeBinary()).toString("hex");
    };

    expect(() => decodeTransactionHex(retyped(51))).toThrowError(
      /ShieldedTransferContract cannot be decoded losslessly/,
    );
    expect(() => decodeTransactionHex(retyped(52))).toThrowError(
      /MarketSellAssetContract cannot be decoded losslessly/,
    );
    // an id outside the catalogue still reports as unknown
    expect(() => decodeTransactionHex(retyped(200))).toThrowError(
      /unsupported TRON contract type id 200/,
    );
  });
});
