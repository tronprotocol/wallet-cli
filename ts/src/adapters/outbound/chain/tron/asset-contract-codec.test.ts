import { describe, expect, it } from "vitest";
import { utils as tronUtils } from "tronweb";
import { decodeTransactionHex, encodeTransactionHex } from "./transaction-codec.js";

/**
 * Golden fixtures built by a live java-tron node (Nile, /wallet/unfreezeasset and
 * /wallet/createassetissue) on 2026-08-09. They are the reference for what these two contract
 * types must serialise to: `encodeTransactionHex` recomputes raw_data_hex and txID from
 * raw_data and refuses the artifact unless both match, so simply encoding a node-built artifact
 * asserts byte-for-byte agreement with the node.
 */
const UNFREEZE_FIXTURE = {
  visible: false,
  txID: "802cc6ec1a91e97ba76a596d2ba82d3fe8401827200734cc8d5a621575ce01e5",
  raw_data: {
    ref_block_bytes: "f7c4",
    ref_block_hash: "0d5c9f3c08da6358",
    expiration: 1_786_286_820_000,
    timestamp: 1_786_286_760_381,
    contract: [
      {
        parameter: {
          value: { owner_address: "417e95e45f5a60cc45f2d0afe37ee9f77fb8ce9fff" },
          type_url: "type.googleapis.com/protocol.UnfreezeAssetContract",
        },
        type: "UnfreezeAssetContract",
      },
    ],
  },
  raw_data_hex:
    "0a02f7c422080d5c9f3c08da635840a095f7b7fe335a51080e124d0a32747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e556e667265657a654173736574436f6e747261637412170a15417e95e45f5a60cc45f2d0afe37ee9f77fb8ce9fff70bdc3f3b7fe33",
};

const ISSUER = "419756bae210f6e9591f311613cff8f19d6cef3971";
const THREE_TRANCHES = [
  { frozen_amount: 100_000_000_000_000, frozen_days: 30 },
  { frozen_amount: 50_000_000_000_000, frozen_days: 90 },
  { frozen_amount: 25_000_000_000_000, frozen_days: 180 },
];

function issueFixture(frozenSupply: Array<{ frozen_amount: number; frozen_days: number }>) {
  return {
    visible: false,
    raw_data: {
      ref_block_bytes: "f7c4",
      ref_block_hash: "0d5c9f3c08da6358",
      expiration: 1_786_286_820_000,
      contract: [
        {
          parameter: {
            value: {
              owner_address: ISSUER,
              name: "4d79546f6b656e",
              abbr: "4d544b",
              total_supply: 1_000_000_000_000_000,
              frozen_supply: frozenSupply,
              trx_num: 1,
              precision: 6,
              num: 100,
              start_time: 1_800_000_000_000,
              end_time: 1_800_900_000_000,
              description: "44656d6f205452433130",
              url: "68747470733a2f2f6d79746f6b656e2e696f",
            },
            type_url: "type.googleapis.com/protocol.AssetIssueContract",
          },
          type: "AssetIssueContract",
        },
      ],
    },
  };
}

// Three tranches, node-built.
const ISSUE_THREE = {
  ...issueFixture(THREE_TRANCHES),
  txID: "47d35a1e0ac7ad61caee0a2fa2476c27a7f12a87b802cb9bdb95e3935716cfe3",
  raw_data: { ...issueFixture(THREE_TRANCHES).raw_data, timestamp: 1_786_286_761_378 },
  raw_data_hex:
    "0a02f7c422080d5c9f3c08da635840a095f7b7fe335ac201080612bd010a2f747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e41737365744973737565436f6e74726163741289010a15419756bae210f6e9591f311613cff8f19d6cef397112074d79546f6b656e1a034d544b2080809aa6eaafe3012a0a088080e983b1de16101e2a0a0880c0f4c198af0b105a2a0b0880a0faa0ccd70510b4013001380640644880a0f1c2b1345080f284f0b434a2010a44656d6f205452433130aa011268747470733a2f2f6d79746f6b656e2e696f70a2cbf3b7fe33",
};

// One tranche — the case TronWeb already handled, kept as a control.
const ISSUE_ONE = {
  ...issueFixture([THREE_TRANCHES[0]!]),
  txID: "88066b3939a6ca1d22c23c186128f7bd34e733320557664f0b1856e289588c93",
  raw_data: { ...issueFixture([THREE_TRANCHES[0]!]).raw_data, timestamp: 1_786_286_761_623 },
  raw_data_hex:
    "0a02f7c422080d5c9f3c08da635840a095f7b7fe335aa801080612a3010a2f747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e41737365744973737565436f6e747261637412700a15419756bae210f6e9591f311613cff8f19d6cef397112074d79546f6b656e1a034d544b2080809aa6eaafe3012a0a088080e983b1de16101e3001380640644880a0f1c2b1345080f284f0b434a2010a44656d6f205452433130aa011268747470733a2f2f6d79746f6b656e2e696f7097cdf3b7fe33",
};

describe("TRC10 contract types TronWeb cannot round-trip", () => {
  it("encodes UnfreezeAssetContract exactly as the node does", () => {
    // encodeTransactionHex throws unless the recomputed raw_data_hex and txID both match.
    const hex = encodeTransactionHex(UNFREEZE_FIXTURE);
    expect(decodeTransactionHex(hex).raw_data_hex).toBe(UNFREEZE_FIXTURE.raw_data_hex);
    expect(decodeTransactionHex(hex).txID).toBe(UNFREEZE_FIXTURE.txID);
  });

  it("encodes a multi-tranche AssetIssueContract exactly as the node does", () => {
    const hex = encodeTransactionHex(ISSUE_THREE);
    const decoded = decodeTransactionHex(hex);
    expect(decoded.raw_data_hex).toBe(ISSUE_THREE.raw_data_hex);
    expect(decoded.txID).toBe(ISSUE_THREE.txID);
  });

  it("leaves the single-tranche AssetIssueContract encoding unchanged", () => {
    const hex = encodeTransactionHex(ISSUE_ONE);
    const decoded = decodeTransactionHex(hex);
    expect(decoded.raw_data_hex).toBe(ISSUE_ONE.raw_data_hex);
    expect(decoded.txID).toBe(ISSUE_ONE.txID);
  });

  it("preserves every frozen tranche through a decode", () => {
    const decoded = decodeTransactionHex(encodeTransactionHex(ISSUE_THREE));
    const value = decoded.raw_data.contract[0]?.parameter?.value as {
      frozen_supply?: Array<{ frozen_amount: number; frozen_days: number }>;
    };
    expect(value.frozen_supply).toEqual(THREE_TRANCHES);
  });

  it("re-encodes a decoded artifact to identical bytes", () => {
    for (const fixture of [UNFREEZE_FIXTURE, ISSUE_THREE, ISSUE_ONE]) {
      const hex = encodeTransactionHex(fixture);
      expect(encodeTransactionHex(decodeTransactionHex(hex))).toBe(hex);
    }
  });

  it("decodes UnfreezeAssetContract back to its own type and owner", () => {
    const decoded = decodeTransactionHex(encodeTransactionHex(UNFREEZE_FIXTURE));
    expect(decoded.raw_data.contract[0]?.type).toBe("UnfreezeAssetContract");
    expect(decoded.raw_data.contract[0]?.parameter?.type_url).toBe(
      "type.googleapis.com/protocol.UnfreezeAssetContract",
    );
    expect(decoded.raw_data.contract[0]?.parameter?.value?.owner_address)
      // TronWeb's own deserialisers emit upper-case hex addresses; ours matches them.
      .toBe("417E95E45F5A60CC45F2D0AFE37EE9F77FB8CE9FFF");
  });

  it("carries Permission_id and signatures through both types", () => {
    const SIGNATURE = "ab".repeat(65);
    for (const fixture of [UNFREEZE_FIXTURE, ISSUE_THREE]) {
      const withPermission = {
        ...fixture,
        txID: undefined,
        raw_data_hex: undefined,
        raw_data: {
          ...fixture.raw_data,
          contract: [{ ...fixture.raw_data.contract[0]!, Permission_id: 2 }],
        },
        signature: [SIGNATURE],
      };
      const decoded = decodeTransactionHex(encodeTransactionHex(withPermission));
      expect(decoded.raw_data.contract[0]?.Permission_id).toBe(2);
      expect(decoded.signature).toEqual([SIGNATURE]);
    }
  });

  it("rejects an AssetIssueContract whose raw_data_hex disagrees with its tranches", () => {
    // the node's three-tranche bytes, but raw_data claiming only the first tranche
    expect(() =>
      encodeTransactionHex({
        ...ISSUE_THREE,
        raw_data: {
          ...ISSUE_THREE.raw_data,
          contract: [
            {
              ...ISSUE_THREE.raw_data.contract[0]!,
              parameter: {
                ...ISSUE_THREE.raw_data.contract[0]!.parameter,
                value: {
                  ...ISSUE_THREE.raw_data.contract[0]!.parameter.value,
                  frozen_supply: [THREE_TRANCHES[0]!],
                },
              },
            },
          ],
        },
      }),
    ).toThrow(/raw_data_hex does not match raw_data/);
  });

  /**
   * Guard on the reason this module exists. If a future TronWeb fixes its own serialiser, this
   * test fails and the override can be reconsidered; until then it documents the defect.
   */
  it("documents that TronWeb's own serialiser still drops tranches after the first", () => {
    const viaTronWeb = tronUtils.transaction.txJsonToPb(ISSUE_THREE as never);
    expect(tronUtils.transaction.txPbToRawDataHex(viaTronWeb).toLowerCase()).not.toBe(
      ISSUE_THREE.raw_data_hex,
    );

    // ...and that it cannot build an UnfreezeAssetContract at all.
    expect(() => tronUtils.transaction.txJsonToPb(UNFREEZE_FIXTURE as never)).toThrow();
  });
});
