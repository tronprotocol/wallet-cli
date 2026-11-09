import { describe, it, expect } from "vitest";
import { classifyEvmRejection, CLASSIFIED_METHODS } from "./node-errors.js";

describe("classifyEvmRejection", () => {
  it("reads a simulation's funding failure as insufficient_balance", () => {
    expect(
      classifyEvmRejection(
        "eth_estimateGas",
        "insufficient funds for gas * price + value: balance 0",
      )?.code,
    ).toBe("insufficient_balance");
  });

  it("reads a simulation's revert as execution_reverted", () => {
    expect(classifyEvmRejection("eth_estimateGas", "execution reverted: ERC20: bad")?.code).toBe(
      "execution_reverted",
    );
    expect(classifyEvmRejection("eth_call", "execution reverted")?.code).toBe("execution_reverted");
  });

  it("reads a submission's stale nonce as nonce_too_low", () => {
    expect(classifyEvmRejection("eth_sendRawTransaction", "nonce too low")?.code).toBe(
      "nonce_too_low",
    );
  });

  it("splits `out of gas` by method", () => {
    expect(classifyEvmRejection("eth_call", "out of gas")?.code).toBe("execution_reverted");
    expect(classifyEvmRejection("eth_estimateGas", "out of gas")?.code).toBe("execution_reverted");
    expect(classifyEvmRejection("eth_sendRawTransaction", "out of gas")?.code).toBe("gas_too_low");
  });

  it("keeps intrinsic-gas wording as gas_too_low on a submission", () => {
    expect(classifyEvmRejection("eth_sendRawTransaction", "intrinsic gas too low")?.code).toBe(
      "gas_too_low",
    );
  });

  it.each(["eth_getBalance", "eth_getTransactionCount", "eth_getCode", "eth_chainId"])(
    "refuses to classify %s, whatever the wording",
    (method) => {
      expect(classifyEvmRejection(method, "insufficient funds")).toBeUndefined();
      expect(classifyEvmRejection(method, "execution reverted")).toBeUndefined();
    },
  );

  it("classifies exactly the three methods that execute something", () => {
    expect([...CLASSIFIED_METHODS].sort()).toEqual([
      "eth_call",
      "eth_estimateGas",
      "eth_sendRawTransaction",
    ]);
  });

  it("leaves wording it does not recognise to the caller", () => {
    expect(classifyEvmRejection("eth_sendRawTransaction", "something new")).toBeUndefined();
  });
});
