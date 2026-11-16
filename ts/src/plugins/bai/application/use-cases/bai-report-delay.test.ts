import { describe, expect, it } from "vitest";
import { baiReportDelayMs } from "./bai-report-delay.js";

describe("baiReportDelayMs", () => {
  it("waits 15 seconds when nothing is set", () => {
    expect(baiReportDelayMs(undefined)).toBe(15_000);
  });

  it("uses a setting of one to seven digits", () => {
    expect(baiReportDelayMs("0")).toBe(0);
    expect(baiReportDelayMs("250")).toBe(250);
    expect(baiReportDelayMs("9999999")).toBe(9_999_999);
  });

  it("ignores any other setting", () => {
    for (const setting of ["", "12345678", "-1", "1.5", " 5", "5ms", "1e3"]) {
      expect(baiReportDelayMs(setting)).toBe(15_000);
    }
  });
});
