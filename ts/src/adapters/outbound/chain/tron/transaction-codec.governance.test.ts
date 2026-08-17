import { describe, expect, it } from "vitest";
import { encodeTransactionHex, rawDataHexOf } from "./transaction-codec.js";

/**
 * Both protobuf paths must apply the SAME override table.
 *
 * `rawDataHexOf` (the integrity arbiter) and `encodeTransactionHex` (the `--build-only` /
 * `--sign-only` artifact) used to dispatch overrides separately, so a type could be correct in one
 * and wrong in the other. That is how `--build-only` shipped unusable for the governance commands:
 * the artifact path fell through to tronweb's encoder for exactly the two types we override because
 * tronweb encodes them wrongly.
 *
 * The check below is shape-independent: whatever bytes our serialiser produces for a governance
 * contract, BOTH functions must produce the same ones, and `encodeTransactionHex` must accept a
 * raw_data_hex derived from `rawDataHexOf` rather than rejecting it as a mismatch.
 */
const REF = {
  ref_block_bytes: "4b6b",
  ref_block_hash: "4ad4875499feb0de",
  expiration: 1786000000000,
  timestamp: 1785999940000,
};

const OWNER_HEX = "418c7145112ac207cc95544a930c769d468d01cd4e";
const CONTRACT_HEX = "419676189bf6a884aeb297c2447e890326aa074502";

function tx(type: string, value: Record<string, unknown>) {
  return {
    visible: false,
    raw_data: {
      contract: [
        {
          parameter: { value, type_url: `type.googleapis.com/protocol.${type}` },
          type,
        },
      ],
      ...REF,
    },
  };
}

const CASES = [
  [
    "UpdateEnergyLimitContract",
    { owner_address: OWNER_HEX, contract_address: CONTRACT_HEX, origin_energy_limit: 15_000_000 },
  ],
  [
    "ProposalCreateContract",
    { owner_address: OWNER_HEX, parameters: [{ key: 0, value: 100_000 }] },
  ],
] as const;

describe("governance contracts encode identically on both protobuf paths", () => {
  it.each(CASES)("%s: encodeTransactionHex agrees with rawDataHexOf", (type, value) => {
    const candidate = tx(type, value as Record<string, unknown>);
    const rawDataHex = rawDataHexOf(candidate);
    expect(rawDataHex).toMatch(/^[0-9a-f]+$/);

    // encodeTransactionHex verifies raw_data_hex against its own encoding and throws on mismatch,
    // so this passing IS the proof that both paths used the same serialiser.
    const complete = encodeTransactionHex({ ...candidate, raw_data_hex: rawDataHex });
    expect(complete).toContain(rawDataHex);
  });

  it.each(CASES)("%s: the encoded bytes carry the value, not a placeholder zero", (type, value) => {
    // The exact encoders feed a zero placeholder to tronweb and then replace the Any payload; if a
    // path skipped that replacement the value would silently serialise as 0.
    const hex = rawDataHexOf(tx(type, value as Record<string, unknown>));
    const zeroed = rawDataHexOf(
      tx(
        type,
        type === "UpdateEnergyLimitContract"
          ? { owner_address: OWNER_HEX, contract_address: CONTRACT_HEX, origin_energy_limit: 0 }
          : { owner_address: OWNER_HEX, parameters: [{ key: 0, value: 0 }] },
      ),
    );
    expect(hex).not.toBe(zeroed);
  });

  it("still routes the TRC10 overrides through the same table", () => {
    // UnfreezeAssetContract has no tronweb serialiser at all, so a regression in the shared dispatch
    // would surface here first.
    const hex = rawDataHexOf(tx("UnfreezeAssetContract", { owner_address: OWNER_HEX }));
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });
});
