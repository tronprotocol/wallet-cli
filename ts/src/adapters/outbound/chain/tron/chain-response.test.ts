import { describe, expect, it } from "vitest";
import type { Types } from "tronweb";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import {
  broadcastResult,
  normalizeProposal,
  normalizeWitness,
  parsePriceTimeline,
  parseTronBlockResponse,
  tronBlock,
  tronNodeInfo,
} from "./chain-response.js";

const SR_HEX = "41" + "11".repeat(20);
const SR = tronHexToBase58(SR_HEX);
const TX_ID = "ab".repeat(32);
const hex = (text: string) => Buffer.from(text, "utf8").toString("hex");

describe("normalizeWitness", () => {
  it("maps a node witness, decoding its hex URL", () => {
    expect(
      normalizeWitness({
        address: SR_HEX,
        vote_count: "12",
        url: hex("https://sr.example"),
        totalProduced: 5,
        isJobs: true,
      }),
    ).toEqual({
      address: SR,
      voteCount: "12",
      url: "https://sr.example",
      totalProduced: 5,
      totalMissed: undefined,
      latestBlockNum: undefined,
      latestSlotNum: undefined,
      isJobs: true,
    });
  });

  it.each([
    ["plain URL", "https://sr.example", "https://sr.example"],
    ["odd-length hex", "abc", "abc"],
    ["absent URL", undefined, undefined],
  ])("keeps a %s", (_name, url, expected) => {
    expect(normalizeWitness({ address: SR_HEX, url })?.url).toBe(expected);
  });

  it.each([
    ["a non-object", null],
    ["no address", { voteCount: 1 }],
  ])("returns null for %s", (_name, value) => {
    expect(normalizeWitness(value)).toBeNull();
  });
});

describe("normalizeProposal", () => {
  const proposal = (overrides: Record<string, unknown> = {}) => ({
    proposal_id: 7,
    proposer_address: SR_HEX,
    ...overrides,
  });

  it("maps snake_case fields and defaults the rest", () => {
    expect(
      normalizeProposal(
        proposal({
          parameters: [{ key: 0, value: 100 }],
          expiration_time: 2,
          create_time: 1,
          approvals: [SR_HEX, ""],
          state: "approved",
        }),
      ),
    ).toEqual({
      id: 7,
      proposerAddress: SR,
      parameters: { "0": "100" },
      expirationTime: 2,
      createTime: 1,
      approvals: [SR],
      state: "APPROVED",
    });
  });

  it.each([
    ["key/value array", [{ key: 1, value: 2 }, { key: 3 }, null], { "1": "2" }],
    ["map", { "4": 5, "6": null }, { "4": "5" }],
    ["absent", undefined, {}],
  ])("reads parameters as a %s", (_name, parameters, expected) => {
    expect(normalizeProposal(proposal({ parameters }))?.parameters).toEqual(expected);
  });

  it.each([
    ["CANCELED", "CANCELED"],
    [1, "DISAPPROVED"],
    [9, "PENDING"],
    [undefined, "PENDING"],
  ])("reads state %s as %s", (state, expected) => {
    expect(normalizeProposal(proposal({ state }))?.state).toBe(expected);
  });

  it.each([
    ["a non-object", null],
    ["a negative id", proposal({ proposal_id: -1 })],
    ["a missing id", proposal({ proposal_id: undefined })],
    ["no proposer", proposal({ proposer_address: undefined })],
  ])("returns null for %s", (_name, value) => {
    expect(normalizeProposal(value)).toBeNull();
  });
});

describe("tronBlock", () => {
  it("reads the header and counts transactions", () => {
    const block = parseTronBlockResponse(
      '{"blockID": "00", "block_header": {"raw_data": {"number": 9, "timestamp": 1700000000000}}, "transactions": [{}, {}]}',
    );
    expect(tronBlock(block)).toMatchObject({
      number: 9,
      timestampMs: 1700000000000,
      transactionCount: 2,
    });
  });

  it("treats omitted header values as genesis zeros", () => {
    const genesis = parseTronBlockResponse(
      '{"blockID": "00", "block_header": {"raw_data": {"parentHash": "e5"}, "witness_signature": "00"}}',
    );
    expect(tronBlock(genesis)).toMatchObject({
      number: 0,
      timestampMs: 0,
      transactionCount: 0,
    });
  });

  it.each([
    ["no header", '{"blockID": "00"}'],
    ["a header without raw_data", '{"blockID": "00", "block_header": {}}'],
    ["a non-object header", '{"blockID": "00", "block_header": "x"}'],
  ])("rejects a block with %s as invalid_node_response", (_case, text) => {
    expect(() => tronBlock(parseTronBlockResponse(text))).toThrow(
      expect.objectContaining({ code: "invalid_node_response" }),
    );
  });

  it("returns null for a height the node does not hold", () => {
    expect(tronBlock({} as Types.Block)).toBeNull();
  });

  it("keeps an unsafe integer exact so the header check rejects it", () => {
    const block = parseTronBlockResponse(
      '{"blockID": "00", "block_header": {"raw_data": {"number": 9007199254740993}}}',
    );
    expect(block.block_header.raw_data.number).toBe("9007199254740993");
    expect(() => tronBlock(block)).toThrow(/block number/);
  });
});

describe("parsePriceTimeline", () => {
  it("reads comma-separated sinceMs:price pairs", () => {
    expect(parsePriceTimeline("0:100,1700000000000:210", "energy")).toEqual([
      { sinceMs: 0, sunPerUnit: 100 },
      { sinceMs: 1700000000000, sunPerUnit: 210 },
    ]);
  });

  it.each([[""], [undefined], ["0:100,bad"], ["0:-1"], ["9007199254740993:1"]])(
    "rejects %s",
    (raw) => {
      expect(() => parsePriceTimeline(raw, "energy")).toThrow(/malformed energy price timeline/);
    },
  );
});

describe("tronNodeInfo", () => {
  it("reads the solid block, peers and versions", () => {
    expect(
      tronNodeInfo({
        solidityBlock: "Num:42,ID:00ab",
        currentConnectCount: 3,
        activeConnectCount: 2,
        configNodeInfo: { codeVersion: "4.7.4", p2pVersion: "11111" },
      }),
    ).toEqual({
      solidBlockNumber: 42,
      peers: { connected: 3, active: 2 },
      codeVersion: "4.7.4",
      p2pVersion: "11111",
    });
  });

  it.each([
    ["empty response", {}],
    ["one peer count only", { currentConnectCount: 3 }],
    ["malformed solid block", { solidityBlock: "ID:00ab" }],
    ["empty versions", { configNodeInfo: { codeVersion: "", p2pVersion: 1 } }],
  ])("omits fields for an %s", (_name, info) => {
    expect(tronNodeInfo(info)).toEqual({});
  });
});

describe("broadcastResult", () => {
  it.each([
    ["txid", { result: true, txid: TX_ID }, { txId: TX_ID }],
    ["transaction.txID", { result: true, transaction: { txID: TX_ID } }, { txId: TX_ID }],
    ["no id", { result: true }, { txId: undefined }],
  ])("accepts explicit acceptance with %s", (_name, response, expected) => {
    expect(broadcastResult(response, TX_ID)).toEqual(expected);
  });

  it("treats a duplicate of the sent transaction as already known", () => {
    expect(
      broadcastResult(
        { code: "DUP_TRANSACTION_ERROR", message: "dup", txid: TX_ID.toUpperCase() },
        TX_ID,
      ),
    ).toEqual({ txId: TX_ID, alreadyKnown: true });
  });

  it.each([
    ["a non-object", null, "invalid_node_response", undefined],
    ["an array", [], "invalid_node_response", undefined],
    ["neither acceptance nor reason", { result: false }, "invalid_node_response", undefined],
    [
      "a hex-encoded rejection",
      { code: "CONTRACT_VALIDATE_ERROR", message: hex("some new rule") },
      "transaction_rejected",
      "some new rule",
    ],
    [
      "an expired transaction",
      { code: "TRANSACTION_EXPIRATION_ERROR" },
      "tx_expired",
      "TRANSACTION_EXPIRATION_ERROR",
    ],
    ["an outcome-unknown code", { code: "OTHER_ERROR", message: "boom" }, "rpc_error", "boom"],
    [
      "a duplicate of another transaction",
      { code: "DUP_TRANSACTION_ERROR", txid: "cd".repeat(32) },
      "rpc_error",
      "DUP_TRANSACTION_ERROR",
    ],
  ])("rejects %s", (_name, response, code, nodeMessage) => {
    let error: unknown;
    try {
      broadcastResult(response, TX_ID);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code });
    if (nodeMessage !== undefined) {
      expect(error).toMatchObject({ details: { nodeMessage } });
    }
  });
});
