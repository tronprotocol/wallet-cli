import { expect, it } from "vitest";
import { currentTronEnergyPrice } from "./tron-energy-price.js";
it("extracts the current energy price without rounding or inventing missing data", () => {
  expect(currentTronEnergyPrice("0:100,1000:9007199254740993")).toBe("9007199254740993");
  expect(currentTronEnergyPrice("100")).toBe("100");
  for (const value of [undefined, "", "0:100,bad", "0:NaN", "-1", "0:0"])
    expect(currentTronEnergyPrice(value)).toBeUndefined();
});
