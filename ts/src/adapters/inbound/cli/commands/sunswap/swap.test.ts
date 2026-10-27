import { describe, expect, it } from "vitest";
import { sunswapSwapSpec } from "./swap.js";

describe("sunswap swap --quote", () => {
  it("declares --wait and --wait-timeout refused under --quote", () => {
    expect(sunswapSwapSpec.rejectsWaitWith).toBe("quote");
  });
});
