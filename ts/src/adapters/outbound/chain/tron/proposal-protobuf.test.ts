import { describe, expect, it } from "vitest";
import { utils as tronUtils } from "tronweb";
import {
  proposalCreatePayloadHex,
  proposalCreateTxJsonToPbExact,
  updateEnergyLimitTxJsonToPbExact,
} from "./proposal-protobuf.js";

const OWNER_HEX = "410000000000000000000000000000000000000000";

function transaction(value: number | string) {
  return {
    visible: false,
    raw_data: {
      contract: [
        {
          parameter: {
            value: { owner_address: OWNER_HEX, parameters: [{ key: 17, value }] },
            type_url: "type.googleapis.com/protocol.ProposalCreateContract",
          },
          type: "ProposalCreateContract",
        },
      ],
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      expiration: 2_000_000,
      timestamp: 1_000_000,
    },
  };
}

describe("exact ProposalCreateContract protobuf", () => {
  it("is byte-identical to TronWeb for safe integers", () => {
    const input = transaction(123_456);
    expect(tronUtils.transaction.txPbToRawDataHex(proposalCreateTxJsonToPbExact(input))).toBe(
      tronUtils.transaction.txPbToRawDataHex(tronUtils.transaction.txJsonToPb(input)),
    );
  });

  it("encodes the full Java long without Number rounding", () => {
    const payload = proposalCreatePayloadHex(OWNER_HEX, [
      { key: 17, value: "9223372036854775807" },
    ]);
    // Map entry: key=17, value=Long.MAX_VALUE (ff..ff7f varint).
    expect(payload).toContain("120c081110ffffffffffffffff7f");
  });
});

describe("exact UpdateEnergyLimitContract protobuf", () => {
  function energyTransaction(value: number | string) {
    return {
      visible: false,
      raw_data: {
        contract: [
          {
            parameter: {
              value: {
                owner_address: OWNER_HEX,
                contract_address: "411111111111111111111111111111111111111111",
                origin_energy_limit: value,
              },
              type_url: "type.googleapis.com/protocol.UpdateEnergyLimitContract",
            },
            type: "UpdateEnergyLimitContract",
          },
        ],
        ref_block_bytes: "1234",
        ref_block_hash: "0011223344556677",
        expiration: 2_000_000,
        timestamp: 1_000_000,
      },
    };
  }

  it("is byte-identical to TronWeb for safe values", () => {
    const input = energyTransaction(50_000_000);
    expect(tronUtils.transaction.txPbToRawDataHex(updateEnergyLimitTxJsonToPbExact(input))).toBe(
      tronUtils.transaction.txPbToRawDataHex(tronUtils.transaction.txJsonToPb(input)),
    );
  });

  it("preserves a positive int64 supplied as a decimal string", () => {
    const encoded = tronUtils.transaction.txPbToRawDataHex(
      updateEnergyLimitTxJsonToPbExact(energyTransaction("9223372036854775807")),
    );
    expect(encoded.toLowerCase()).toContain("18ffffffffffffffff7f");
  });
});
