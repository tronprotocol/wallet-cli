import { describe, expect, it } from "vitest";
import { parse as parseLosslessJson } from "lossless-json";
import { ChainError } from "../../../../domain/errors/index.js";
import {
  decodeAbiString,
  decodeAbiUint,
  decodeTronMessage,
  nodeQuantity,
  normalizeAccountValue,
  normalizeLosslessValue,
  normalizeTxInfoValue,
  optionalNodeTime,
  optionalNumber,
  quantityString,
  safeChainParameter,
  safeNodeInteger,
} from "./node-values.js";

const word = (value: bigint | number) => BigInt(value).toString(16).padStart(64, "0");
const utf8Hex = (text: string) => Buffer.from(text, "utf8").toString("hex");

describe("quantityString", () => {
  it.each([
    [5n, "5"],
    [-1n, "0"],
    [42, "42"],
    [-1, "0"],
    [1.5, "0"],
    [Number.MAX_SAFE_INTEGER + 2, "0"],
    ["123", "123"],
    ["-1", "0"],
    ["1e3", "0"],
    [undefined, "0"],
    [null, "0"],
  ])("%s -> %s", (input, expected) => {
    expect(quantityString(input)).toBe(expected);
  });
});

describe("optionalNumber", () => {
  it.each([
    [7, 7],
    ["7", 7],
    ["", 0],
    [null, 0],
    [undefined, undefined],
    ["x", undefined],
    [Infinity, undefined],
  ])("%s -> %s", (input, expected) => {
    expect(optionalNumber(input)).toBe(expected);
  });
});

describe("nodeQuantity", () => {
  it.each([
    [undefined, "0"],
    ["9007199254740993", "9007199254740993"],
    [12, "12"],
  ])("%s -> %s", (input, expected) => {
    expect(nodeQuantity(input, "balance")).toBe(expected);
  });

  it.each([[-1], [1.5], [Number.MAX_SAFE_INTEGER + 2], ["-1"], [null], [true]])(
    "rejects %s",
    (input) => {
      expect(() => nodeQuantity(input, "balance")).toThrow(ChainError);
    },
  );
});

describe("safeNodeInteger", () => {
  it.each([
    [0, 0],
    [12, 12],
    ["12", 12],
  ])("%s -> %s", (input, expected) => {
    expect(safeNodeInteger(input, "field")).toBe(expected);
  });

  it.each([[-1], [1.5], ["9007199254740993"], ["-1"], [undefined], [null]])(
    "rejects %s",
    (input) => {
      expect(() => safeNodeInteger(input, "field")).toThrow(/imprecise or invalid field/);
    },
  );
});

describe("optionalNodeTime", () => {
  it.each([
    [undefined, undefined],
    [0, undefined],
    ["0", undefined],
    [1_700_000_000_000, 1_700_000_000_000],
  ])("%s -> %s", (input, expected) => {
    expect(optionalNodeTime(input, "create_time")).toBe(expected);
  });

  it("rejects a malformed time", () => {
    expect(() => optionalNodeTime(-1, "create_time")).toThrow(ChainError);
  });
});

describe("safeChainParameter", () => {
  it.each([
    [-1, -1],
    ["-1", -1],
    [420, 420],
    ["420", 420],
  ])("%s -> %s", (input, expected) => {
    expect(safeChainParameter(input, "getEnergyFee")).toBe(expected);
  });

  it.each([[1.5], ["9007199254740993"], ["x"], [undefined]])("rejects %s", (input) => {
    expect(() => safeChainParameter(input, "getEnergyFee")).toThrow(/getEnergyFee/);
  });
});

describe("lossless JSON normalizers", () => {
  const UNSAFE = "9007199254740993";

  it.each([
    ["account quantity key", `{"balance": 1}`, { balance: "1" }],
    ["key matching /balance/i", `{"frozenBalanceX": 2}`, { frozenBalanceX: "2" }],
    ["safe non-quantity", `{"create_time": 3}`, { create_time: 3 }],
    ["unsafe non-quantity", `{"other": ${UNSAFE}}`, { other: UNSAFE }],
    ["nested arrays", `{"list": [{"amount": 4}, 5]}`, { list: [{ amount: "4" }, 5] }],
  ])("normalizeAccountValue: %s", (_name, text, expected) => {
    expect(normalizeAccountValue(parseLosslessJson(text))).toEqual(expected);
  });

  it.each([
    ["realized amount key", `{"withdraw_amount": 1}`, { withdraw_amount: "1" }],
    ["safe other key", `{"fee": 2}`, { fee: 2 }],
    ["unsafe other key", `{"fee": ${UNSAFE}}`, { fee: UNSAFE }],
    ["key applies only inside objects", `{"log": [3]}`, { log: [3] }],
  ])("normalizeTxInfoValue: %s", (_name, text, expected) => {
    expect(normalizeTxInfoValue(parseLosslessJson(text))).toEqual(expected);
  });

  it.each([
    ["safe integer", `{"balance": 1}`, { balance: 1 }],
    ["unsafe integer", `{"n": [${UNSAFE}]}`, { n: [UNSAFE] }],
    ["non-numbers unchanged", `{"s": "x", "b": true, "z": null}`, { s: "x", b: true, z: null }],
  ])("normalizeLosslessValue: %s", (_name, text, expected) => {
    expect(normalizeLosslessValue(parseLosslessJson(text))).toEqual(expected);
  });
});

describe("decodeAbiUint", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["zz", undefined],
    [word(18), 18n],
  ])("%s -> %s", (input, expected) => {
    expect(decodeAbiUint(input)).toBe(expected);
  });
});

describe("decodeAbiString", () => {
  const dynamic = (text: string) =>
    word(32) + word(Buffer.byteLength(text)) + utf8Hex(text).padEnd(64, "0");

  it.each([
    ["absent", undefined, undefined],
    ["non-hex", "zz", undefined],
    ["dynamic string", dynamic("Tether USD"), "Tether USD"],
    ["bytes32 text", utf8Hex("MKR").padEnd(64, "0"), "MKR"],
    ["empty bytes32", "0".repeat(64), undefined],
    ["shorter than a dynamic header", "00".repeat(40), undefined],
    ["offset out of range", word(4096) + word(0), undefined],
    ["length out of range", word(32) + word(4096), undefined],
  ])("%s", (_name, input, expected) => {
    expect(decodeAbiString(input)).toBe(expected);
  });
});

describe("decodeTronMessage", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    [utf8Hex("balance is not sufficient"), "balance is not sufficient"],
    ["abc", "abc"],
    ["plain text", "plain text"],
  ])("%s -> %s", (input, expected) => {
    expect(decodeTronMessage(input)).toBe(expected);
  });
});
