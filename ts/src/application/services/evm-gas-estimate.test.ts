import { describe, expect, it, vi } from "vitest";
import { resolveGasLimit } from "./evm-gas-estimate.js";
import { ChainError } from "../../domain/errors/index.js";

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

    expect(error.message).not.toContain("21000");
  });

  /**
   * The second regression: every failure here used to be reported as `invalid_option` — exit 2,
   * "fix your invocation". A timeout, an HTTP 503 and an unreachable endpoint all landed there, so
   * a caller that retries on exit 1 and gives up on exit 2 gave up on a transient network fault.
   */
  it("keeps a typed failure's own code and exit class, adding only the way out", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new ChainError("timeout", "eth_estimateGas failed: The operation was aborted");
      }),
    };

    const error = await resolveGasLimit(gateway, { from: "0xabc" }).catch((e) => e);

    expect(error.code).toBe("timeout");
    expect(error.exitCode()).toBe(1);
    expect(error.message).toMatch(/--gas-limit/);
  });

  // An untyped throw would otherwise be redacted to a bare internal_error at the top level,
  // taking the node's words with it.
  it("reports an untyped failure as rpc_error rather than letting it be redacted", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new Error("insufficient funds for transfer");
      }),
    };

    const error = await resolveGasLimit(gateway, { from: "0xabc" }).catch((e) => e);

    expect(error.code).toBe("rpc_error");
    expect(error.exitCode()).toBe(1);
    expect(error.message).toContain("insufficient funds");
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
