import { describe, expect, it, vi } from "vitest";
import { resolveGasLimit } from "./evm-gas-estimate.js";

describe("resolveGasLimit", () => {
  it("returns the node's estimate", async () => {
    const gateway = { estimateGas: vi.fn(async () => "45223") };

    await expect(resolveGasLimit(gateway, { from: "0xabc" })).resolves.toBe("45223");
  });

  it("takes --gas-limit without contacting the node", async () => {
    const gateway = { estimateGas: vi.fn(async () => "45223") };

    await expect(resolveGasLimit(gateway, { from: "0xabc" }, "90000")).resolves.toBe("90000");
    expect(gateway.estimateGas).not.toHaveBeenCalled();
  });

  /**
   * The regression this exists for: the estimate used to be swallowed and replaced with 21000 —
   * the intrinsic cost of a plain value transfer — so an ERC-20 transfer was signed with a gas
   * limit that cannot execute it, and the failure surfaced only at broadcast.
   */
  it("never substitutes a guess for a failed estimate", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new Error("insufficient funds for transfer");
      }),
    };

    const error = await resolveGasLimit(gateway, { from: "0xabc" }).catch((e) => e);

    expect(error).toMatchObject({ code: "invalid_option" });
    expect(error.message).not.toContain("21000");
  });

  it("carries the node's own words, which are the useful part", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new Error("execution reverted: ERC20: transfer amount exceeds balance");
      }),
    };

    await expect(resolveGasLimit(gateway, { from: "0xabc" })).rejects.toThrowError(
      /transfer amount exceeds balance/,
    );
  });

  it("points at the way out", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new Error("nope");
      }),
    };

    await expect(resolveGasLimit(gateway, {})).rejects.toThrowError(/--gas-limit/);
  });
});
