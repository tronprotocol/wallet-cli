import { describe, expect, it } from "vitest";
import { computeTronCreate2Address } from "./create2.js";

const DEPLOYER = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("computeTronCreate2Address", () => {
  it("matches the Java wallet-cli TVM CREATE2 vector", () => {
    expect(computeTronCreate2Address(DEPLOYER, "60006000", "1")).toEqual({
      deployerAddress: DEPLOYER,
      salt: 1,
      saltHex: "0x0000000000000000000000000000000000000000000000000000000000000001",
      codeHash: "5e3ce470a8506d55e59815db7232a08774174ae0c7fdb2fbc81a49e4e242b0d6",
      address: "TFVMEWMJCq5fCmADjNzuhKnUFHJkJBBFAW",
    });
  });

  it("encodes a negative Java long with two's-complement in the low 8 bytes", () => {
    const result = computeTronCreate2Address(DEPLOYER, "0x60 00", "-1");
    expect(result.saltHex).toBe(
      "0x000000000000000000000000000000000000000000000000ffffffffffffffff",
    );
  });

  it("rejects Ethereum-style hex salts and an invalid deployer", () => {
    expect(() => computeTronCreate2Address(DEPLOYER, "6000", "0x01")).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
    expect(() =>
      computeTronCreate2Address("0x0000000000000000000000000000000000000000", "6000", "1"),
    ).toThrowError(expect.objectContaining({ code: "invalid_address" }));
  });
});
