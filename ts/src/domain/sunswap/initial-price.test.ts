import { expect, it } from "vitest";
import { initialPrice } from "./initial-price.js";
it.each([
  ["79228162514264337593543950336", 6, 6, "1"],
  ["158456325028528675187087900672", 6, 6, "4"],
  ["79228162514264337593543950336", 6, 18, "0.000000000001"],
  ["79228162514264337593543950336", 18, 6, "1000000000000"],
  // price 2^40 = 1099511627776, rounded down to eight significant digits
  [(1n << 116n).toString(), 6, 6, "1099511600000"],
  ["4295128739", 18, 18, "0." + "0".repeat(38) + "29389568"],
] as const)("scales initial Q96 price %s as a plain decimal", (q, a, b, out) =>
  expect(initialPrice(q, a, b)).toBe(out),
);
