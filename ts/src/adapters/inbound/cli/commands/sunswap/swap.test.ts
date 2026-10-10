import { describe, expect, it } from "vitest";
import { sunswapSwapSpec } from "./swap.js";

describe("sunswap swap --quote", () => {
  // A quote submits nothing, so there is no confirmation to wait for — the same rule
  // `tx send` applies to `--dry-run --wait`. `--wait` and `--wait-timeout` are global, so the
  // shell refuses them from the spec before the binding runs; positional-contract.test.ts drives
  // that refusal end to end for every command that declares it.
  it("declares --wait and --wait-timeout refused under --quote", () => {
    expect(sunswapSwapSpec.rejectsWaitWith).toBe("quote");
  });
});
