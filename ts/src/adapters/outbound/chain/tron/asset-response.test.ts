import { describe, expect, it } from "vitest";
import type { TronAsset } from "../../../../application/ports/chain/tron/tron-gateway.js";
import {
  assertUsableAsset,
  assetList,
  exchangeValue,
  parseTronAssetResponse,
} from "./asset-response.js";

describe("parseTronAssetResponse", () => {
  it("keeps an int64 total supply exact instead of rounding it to a float64", () => {
    const asset = parseTronAssetResponse(`{
      "id": "1002438",
      "total_supply": 666666666666666666,
      "frozen_supply": [{ "frozen_amount": 899999999999999999, "frozen_days": 30 }]
    }`);

    expect(asset.total_supply).toBe("666666666666666666");
    expect(asset.frozen_supply?.[0]?.frozen_amount).toBe("899999999999999999");
  });

  it("keeps int64 max exact — the value that rendered as an impossible 9223372036854776000", () => {
    expect(parseTronAssetResponse('{"total_supply": 9223372036854775807}').total_supply).toBe(
      "9223372036854775807",
    );
  });

  it("normalizes safe quantities to strings too, so the read model has one stable shape", () => {
    const asset = parseTronAssetResponse(
      '{"total_supply": 1000000, "frozen_supply": [{"frozen_amount": 2, "frozen_days": 1}]}',
    );
    expect(asset.total_supply).toBe("1000000");
    expect(asset.frozen_supply?.[0]?.frozen_amount).toBe("2");
  });

  it("decodes the node's hex-encoded text fields", () => {
    const asset = parseTronAssetResponse(
      '{"name": "4556494c", "abbr": "4556", "url": "782e636f6d", "description": "64"}',
    );

    expect(asset.name).toBe("EVIL");
    expect(asset.abbr).toBe("EV");
    expect(asset.url).toBe("x.com");
    expect(asset.description).toBe("d");
  });

  it("leaves the rate pair, precision and window as numbers — they are int32/timestamps", () => {
    const asset = parseTronAssetResponse(
      '{"trx_num": 1000000, "num": 666, "precision": 6, "start_time": 1558134600062, "end_time": 1589755860062}',
    );

    expect(asset.trx_num).toBe(1_000_000);
    expect(asset.num).toBe(666);
    expect(asset.precision).toBe(6);
    expect(asset.start_time).toBe(1_558_134_600_062);
  });

  it("keeps the owner address in the hex form the address helper expects", () => {
    expect(
      parseTronAssetResponse('{"owner_address": "418225f3aa48a2d30643a64410abb1e914dfa0bd2f"}')
        .owner_address,
    ).toBe("418225f3aa48a2d30643a64410abb1e914dfa0bd2f");
  });
});

describe("assertUsableAsset", () => {
  const asset = (overrides: Record<string, unknown> = {}) =>
    ({ id: "1002000", trx_num: 1, num: 1, ...overrides }) as unknown as TronAsset;

  it.each([
    ["absent precision", asset()],
    ["precision 6", asset({ precision: 6 })],
    ["int32 max rate", asset({ trx_num: 2_147_483_647 })],
  ])("accepts %s", (_name, value) => {
    expect(assertUsableAsset(value, "1002000")).toBe(value);
  });

  it.each([
    ["another id than requested", asset({ id: "1002001" }), /asked the node for TRC10 1002000/],
    ["precision above 6", asset({ precision: 7 }), /precision 7 is outside/],
    ["negative precision", asset({ precision: -1 }), /precision -1 is outside/],
    ["a zero trx_num", asset({ trx_num: 0 }), /trx_num 0 is not a positive int32/],
    ["a num above int32", asset({ num: 2_147_483_648 }), /num 2147483648 is not a positive int32/],
    ["a missing num", asset({ num: undefined }), /num undefined is not a positive int32/],
  ])("rejects %s", (_name, value, message) => {
    expect(() => assertUsableAsset(value, "1002000")).toThrow(message);
  });
});

describe("assetList", () => {
  it.each([
    ["no assetIssue", "{}", []],
    ["a non-array assetIssue", '{"assetIssue": 1}', []],
    [
      "an unusable row dropped",
      '{"assetIssue": [{"id": "1", "trx_num": 1, "num": 1}, {"id": "2", "trx_num": 0, "num": 1}]}',
      ["1"],
    ],
  ])("%s", (_name, text, ids) => {
    expect(assetList(text).map((entry) => entry.id)).toEqual(ids);
  });
});

describe("exchangeValue", () => {
  it("keeps balances exact and leaves text undecoded", () => {
    expect(
      exchangeValue(
        '{"exchange_id": 1, "first_token_balance": 9007199254740993, "first_token_id": "5f"}',
      ),
    ).toEqual({ exchange_id: 1, first_token_balance: "9007199254740993", first_token_id: "5f" });
  });
});
