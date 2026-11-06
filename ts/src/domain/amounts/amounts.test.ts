import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertPositive,
  baseUnitAmount,
  sunAmount,
  weiAmount,
  type BaseUnits,
  type Sun,
  type Wei,
  fromBaseUnits,
  isZeroAmount,
  positiveBaseUnits,
  toBaseUnits,
} from "./index.js";
import { inputRef, UsageError } from "../errors/index.js";

describe("supported token precision", () => {
  it.each([-1, 1.5, 78, 9999999999, NaN, Infinity])(
    "rejects decimals %s in both directions",
    (decimals) => {
      for (const convert of [
        () => fromBaseUnits("1", decimals),
        () => toBaseUnits("1", decimals, "token"),
      ]) {
        expect(convert).toThrow(expect.objectContaining({ code: "invalid_node_response" }));
      }
    },
  );

  it.each([0, 77])("round trips the supported boundary %i", (decimals) => {
    const raw = toBaseUnits("1", decimals, "token");
    expect(raw).toBe("1" + "0".repeat(decimals));
    expect(fromBaseUnits(raw, decimals)).toBe("1");
  });
});

describe("fromBaseUnits", () => {
  it("converts base units to a trimmed human decimal", () => {
    expect(fromBaseUnits("1204560000", 6)).toBe("1204.56");
    expect(fromBaseUnits("1000000", 6)).toBe("1");
    expect(fromBaseUnits("100", 6)).toBe("0.0001");
    expect(fromBaseUnits("0", 6)).toBe("0");
  });
  it("preserves negatives (the case the old copies disagreed on)", () => {
    expect(fromBaseUnits("-268000", 6)).toBe("-0.268");
    expect(fromBaseUnits("-1000000", 6)).toBe("-1");
  });
  it("accepts number and bigint", () => {
    expect(fromBaseUnits(1000000, 6)).toBe("1");
    expect(fromBaseUnits(1000000n, 6)).toBe("1");
  });
  it("returns non-integer input unchanged (lenient passthrough)", () => {
    expect(fromBaseUnits("not-a-number", 6)).toBe("not-a-number");
    expect(fromBaseUnits("1.5", 6)).toBe("1.5");
  });
});

describe("toBaseUnits", () => {
  it("converts a human decimal to integer base units", () => {
    expect(toBaseUnits("1204.56", 6, "TRX")).toBe("1204560000");
    expect(toBaseUnits("1", 6, "TRX")).toBe("1000000");
    expect(toBaseUnits("0", 6, "TRX")).toBe("0");
    expect(toBaseUnits("0.0001", 6, "TRX")).toBe("100");
  });
  it("round-trips with fromBaseUnits", () => {
    expect(fromBaseUnits(toBaseUnits("3.14159", 6, "TRX"), 6)).toBe("3.14159");
  });
  it("rejects negative / non-numeric / scientific-notation input", () => {
    expect(() => toBaseUnits("-1", 6, "TRX")).toThrow(UsageError);
    expect(() => toBaseUnits("abc", 6, "TRX")).toThrow(UsageError);
    expect(() => toBaseUnits("1e6", 6, "TRX")).toThrow(UsageError);
  });
  it("rejects more fractional digits than the unit supports", () => {
    expect(() => toBaseUnits("1.1234567", 6, "TRX")).toThrow(/too many decimal places/);
  });

  describe("names the offending option", () => {
    it("defaults to the amount input for the commands whose option is that", () => {
      expect(() => toBaseUnits("1.1234567", 6, "TRX")).toThrow(/^amount has too many/);
      expect(() => toBaseUnits("abc", 6, "TRX")).toThrow(
        expect.objectContaining({
          message: "amount must be a non-negative decimal TRX amount",
          parts: expect.arrayContaining([inputRef("amount")]),
        }),
      );
    });

    it("uses the caller's input reference in both messages", () => {
      expect(() => toBaseUnits("1.1234567", 6, "TRX", inputRef("minReceived"))).toThrow(
        expect.objectContaining({
          message: "minReceived has too many decimal places for TRX (max 6)",
          parts: expect.arrayContaining([inputRef("minReceived")]),
        }),
      );
      expect(() => toBaseUnits("abc", 6, "TRX", inputRef("minReceived"))).toThrow(
        "minReceived must be a non-negative decimal TRX amount",
      );
    });

    it("keeps a plain-text label verbatim", () => {
      expect(() => toBaseUnits("abc", 6, "TRX", "GasFree fee ceiling")).toThrow(
        "GasFree fee ceiling must be a non-negative decimal TRX amount",
      );
    });

    it("still returns the converted value when the input is fine", () => {
      expect(toBaseUnits("1.5", 6, "TRX", inputRef("minReceived"))).toBe("1500000");
    });
  });
});

describe("positive amount rule", () => {
  it("accepts a positive base-unit amount", () => {
    expect(positiveBaseUnits("1", "amount")).toBe("1");
  });
  it.each(["0", "00", "", "1.5", "-1"])("rejects base units %j", (raw) => {
    expect(() => positiveBaseUnits(raw, "amount")).toThrowError(
      expect.objectContaining({ code: "invalid_amount" }),
    );
  });
  it.each([1n, 1])("assertPositive accepts %s", (value) => {
    expect(assertPositive(value, "--count")).toBe(value);
  });
  it.each([0n, -1n, 0, -1])("assertPositive rejects %s with invalid_value", (value) => {
    expect(() => assertPositive(value, "--count")).toThrowError(
      expect.objectContaining({
        code: "invalid_value",
        message: "--count must be greater than zero",
      }),
    );
  });
  it("assertPositive names an input reference", () => {
    expect(() => assertPositive(0, inputRef("count"))).toThrowError(
      expect.objectContaining({
        message: "count must be greater than zero",
        parts: [inputRef("count"), " must be greater than zero"],
      }),
    );
  });
  it.each([
    ["0", true],
    ["0.000", true],
    ["0.01", false],
    ["10", false],
  ])("isZeroAmount(%s) is %s", (text, zero) => {
    expect(isZeroAmount(text)).toBe(zero);
  });
});

describe("unit amount constructors", () => {
  it.each([
    ["SUN", sunAmount],
    ["wei", weiAmount],
    ["base-unit", baseUnitAmount],
  ] as const)("%s keeps exact integer text and bigint values", (_unit, amount) => {
    expect(amount("0")).toBe("0");
    expect(
      amount("115792089237316195423570985008687907853269984665640564039457584007913129639935"),
    ).toBe("115792089237316195423570985008687907853269984665640564039457584007913129639935");
    expect(amount(2n ** 64n)).toBe("18446744073709551616");
  });

  it.each(["", "-1", "1.5", "1e6", " 1", "0x10", "abc"])("refuses %j", (text) => {
    for (const amount of [sunAmount, weiAmount, baseUnitAmount]) {
      expect(() => amount(text)).toThrow(RangeError);
    }
    expect(() => sunAmount(-1n)).toThrow(RangeError);
  });

  it("does not let one unit stand in for another", () => {
    expectTypeOf<Wei>().not.toMatchTypeOf<Sun>();
    expectTypeOf<Sun>().not.toMatchTypeOf<Wei>();
    expectTypeOf<BaseUnits>().not.toMatchTypeOf<Sun>();
    expectTypeOf<Sun>().not.toMatchTypeOf<BaseUnits>();
    expectTypeOf<string>().not.toMatchTypeOf<Sun>();
    expectTypeOf<Sun>().toMatchTypeOf<string>();
    const takesSun = (value: Sun): string => value;
    // @ts-expect-error a Wei amount is not a SUN amount
    takesSun(weiAmount("1"));
    // @ts-expect-error plain text carries no unit
    takesSun("1");
    expect(takesSun(sunAmount("1"))).toBe("1");
  });
});
