import { describe, expect, it } from "vitest";
import {
  offsetWindowToPage,
  refuseBeyondMarketWindow,
  SUNSWAP_MARKET_WINDOW,
} from "./pagination.js";

describe("refuseBeyondMarketWindow", () => {
  it("is the 1000 rows the market service exposes", () => {
    expect(SUNSWAP_MARKET_WINDOW).toBe(1000);
  });

  it.each([
    [980, 20],
    [0, 1000],
    [900, 100],
  ])("accepts a window ending at or before row 1000 (offset %i, limit %i)", (offset, limit) => {
    expect(() => refuseBeyondMarketWindow({ offset, limit })).not.toThrow();
  });

  it.each([
    [1000, 20],
    [1000, 1000],
    [0, 1001],
  ])("refuses a window past row 1000 (offset %i, limit %i)", (offset, limit) => {
    expect(() => refuseBeyondMarketWindow({ offset, limit })).toThrow(
      expect.objectContaining({
        code: "invalid_value",
        message: expect.stringContaining("only the first 1000 rows of each ordering"),
      }),
    );
  });

  // SunPump shares the page translation but not the SunSwap service's limit.
  it("is not part of the page translation itself", () => {
    expect(offsetWindowToPage({ offset: 1000, limit: 20 })).toEqual({ pageNo: 51, pageSize: 20 });
  });
});
