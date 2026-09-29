import { describe, expect, it } from "vitest";
import { multiplyDecimalTruncating, SUNPUMP_ORDER_BY_NAMES, sunpumpSortParam } from "./market.js";
import { CliError } from "../errors/index.js";

describe("sunpumpSortParam", () => {
  it("translates every offered ordering to the service's own column", () => {
    expect(sunpumpSortParam("created", "desc")).toBe("tokenCreatedInstant:DESC");
    expect(sunpumpSortParam("market-cap", "asc")).toBe("marketCap:ASC");
    expect(sunpumpSortParam("volume-24h", "desc")).toBe("volume24Hr:DESC");
    expect(sunpumpSortParam("price-change-24h", "desc")).toBe("priceChange24Hr:DESC");
  });

  // The whole point of the whitelist: the service answers an unknown field with a 200 and
  // marketCap order, so a value that is not translated here must never be forwarded.
  it("refuses an ordering the service does not apply", () => {
    for (const name of ["launched", "tokenLaunchedInstant", "holders", ""]) {
      expect(() => sunpumpSortParam(name, "desc")).toThrowError(CliError);
    }
  });

  it("does not offer `launched`, which the service silently ignores", () => {
    expect(SUNPUMP_ORDER_BY_NAMES).not.toContain("launched");
  });

  it("refuses a direction the service does not apply", () => {
    expect(() => sunpumpSortParam("created", "DESC")).toThrowError(CliError);
    expect(() => sunpumpSortParam("created", "newest")).toThrowError(CliError);
  });
});

describe("multiplyDecimalTruncating", () => {
  // The real pair from a mainnet detail response: eighteen decimals times twelve, and the
  // product a float would give differs in the digits a small-cap price is read by.
  it("keeps every digit of a price × rate product", () => {
    expect(multiplyDecimalTruncating("0.011538978919347204", "0.340814453508", 18)).toBe(
      "0.003932650794437649",
    );
    expect(Number("0.011538978919347204") * Number("0.340814453508")).not.toBe(
      Number("0.003932650794437649"),
    );
  });

  it("truncates rather than rounds, and trims the padding it added", () => {
    expect(multiplyDecimalTruncating("0.9999999999999999999", "1", 6)).toBe("0.999999");
    expect(multiplyDecimalTruncating("2.5", "4", 18)).toBe("10");
    expect(multiplyDecimalTruncating("0", "123.456", 18)).toBe("0");
  });

  it("answers nothing at all for input that is not a decimal literal", () => {
    expect(multiplyDecimalTruncating("", "1", 18)).toBe("");
    expect(multiplyDecimalTruncating("1e-5", "1", 18)).toBe("");
    expect(multiplyDecimalTruncating("abc", "1", 18)).toBe("");
  });
});
