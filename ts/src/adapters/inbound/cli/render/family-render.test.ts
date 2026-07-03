import { describe, it, expect } from "vitest";
import { FAMILY_RENDER } from "./index.js";

describe("FAMILY_RENDER parity", () => {
  it("nativeAmount units", () => {
    expect(FAMILY_RENDER.tron.nativeAmount("1000000")).toBe("1 TRX");
  });
  it("feeFallback: tron formats sun→TRX", () => {
    expect(FAMILY_RENDER.tron.feeFallback("1000000")).toBe("1 TRX");
  });
  it("addressLabel", () => {
    expect(FAMILY_RENDER.tron.addressLabel).toBe("TRON address");
  });
  it("tron txInfoRows include Energy + Fee in TRX", () => {
    const rows = FAMILY_RENDER.tron.txInfoRows({ txid: "t", status: "SUCCESS", feeSun: "1000000", energyUsed: 5 } as any);
    expect(rows).toContainEqual(["Fee", "1 TRX"]);
    expect(rows.map((r) => r[0])).toContain("Energy");
  });
});
