import { expect, it } from "vitest";
import { initialPrice } from "./initial-price.js";
it.each([
  ["79228162514264337593543950336", 6, 6, "1"],
  ["158456325028528675187087900672", 6, 6, "4"],
  ["79228162514264337593543950336", 6, 18, "1e-12"],
  ["79228162514264337593543950336", 18, 6, "1e12"],
  ["4295128739", 18, 18, "2.9389568e-39"],
] as const)("scales initial Q96 price %s", (q, a, b, out) =>
  expect(initialPrice(q, a, b)).toBe(out),
);
