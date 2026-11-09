import { describe, expect, it } from "vitest";
import { sunswapPositionInfoSpec } from "./position-info.js";

const schema = sunswapPositionInfoSpec.baseFields;

describe("sunswap position-info — the schema", () => {
  it("accepts V3 and V4, in either case", () => {
    for (const protocol of ["V3", "V4", "v3", "v4", " V4 "]) {
      const parsed = schema.safeParse({ protocol, positionId: "88" });
      expect(parsed.success, protocol).toBe(true);
      expect((parsed.data as { protocol: string }).protocol).toBe(protocol.trim().toUpperCase());
    }
  });

  it.each(["V2", "V1", "V1_5", "CURVE", "ALL", ""])("refuses --protocol %s", (protocol) => {
    expect(schema.safeParse({ protocol, positionId: "88" }).success).toBe(false);
  });

  it.each(["-1", "1.5", "0x88", "", "88a", " "])("refuses --position-id %s", (positionId) => {
    expect(schema.safeParse({ protocol: "V4", positionId }).success).toBe(false);
  });

  it("accepts an id no double could hold, because it is a uint256", () => {
    const huge = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const parsed = schema.safeParse({ protocol: "V4", positionId: huge });
    expect(parsed.success).toBe(true);
    expect((parsed.data as { positionId: string }).positionId).toBe(huge);
  });

  it.each(["protocol", "positionId"])("requires --%s", (field) => {
    const value: Record<string, unknown> = { protocol: "V4", positionId: "88" };
    delete value[field];
    expect(schema.safeParse(value).success).toBe(false);
  });
});

describe("sunswap position-info — the spec", () => {
  it("takes no account and refuses one, and needs no password", () => {
    expect(sunswapPositionInfoSpec.wallet).toBe("none");
    expect(sunswapPositionInfoSpec.auth).toBe("none");
    expect(sunswapPositionInfoSpec.rejectsAccount).toBeTruthy();
  });

  it("is gated on the liquidity contracts rather than on the market API", () => {
    expect(sunswapPositionInfoSpec.capability).toBe("sunswap.liquidity");
  });
});
