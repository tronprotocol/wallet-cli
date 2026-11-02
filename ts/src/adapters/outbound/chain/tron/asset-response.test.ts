import { describe, expect, it } from "vitest";
import { parseTronAssetResponse } from "./asset-response.js";

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
