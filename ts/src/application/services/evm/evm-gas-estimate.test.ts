import { describe, expect, it, vi } from "vitest";
import { resolveGasLimit } from "./evm-gas-estimate.js";
import { ChainError } from "../../../domain/errors/index.js";
import { errorEnvelope, exitCodeOf } from "../../../adapters/inbound/cli/output/errors.js";

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

  it("never substitutes a guess for a failed estimate", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new Error("insufficient funds for transfer");
      }),
    };

    const error = await resolveGasLimit(gateway, { from: "0xabc" }).catch((e) => e);

    expect(error.message).not.toContain("21000");
  });

  it("keeps a typed failure's own code and exit class, adding only the way out", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new ChainError("timeout", "eth_estimateGas failed: The operation was aborted");
      }),
    };

    const error = await resolveGasLimit(gateway, { from: "0xabc" }).catch((e) => e);

    expect(error.code).toBe("timeout");
    expect(exitCodeOf(error)).toBe(1);
    expect(errorEnvelope(error).message).toBe(
      "eth_estimateGas failed: The operation was aborted; pass --gas-limit to proceed without an estimate",
    );
  });

  it("reports an untyped failure as rpc_error rather than letting it be redacted", async () => {
    const gateway = {
      estimateGas: vi.fn(async () => {
        throw new Error("insufficient funds for transfer");
      }),
    };

    const error = await resolveGasLimit(gateway, { from: "0xabc" }).catch((e) => e);

    expect(error.code).toBe("rpc_error");
    expect(exitCodeOf(error)).toBe(1);
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

    const error = await resolveGasLimit(gateway, {}).catch((e) => e);

    expect(error.message).toMatch(/pass gasLimit to proceed/);
    expect(errorEnvelope(error).message).toBe(
      "the node could not estimate gas for this transaction; pass --gas-limit to proceed without an estimate. The node said: nope",
    );
  });
});
