import { describe, expect, it } from "vitest";
import { utils as tronUtils } from "tronweb";
import { TronRpcClient } from "./tron.js";

describe("TronRpcClient.typedDataDigest", () => {
  it("hashes TIP-712 data as TronWeb signs it", () => {
    const payload = {
      domain: { name: "T", chainId: 3448148188 },
      types: { Mail: [{ name: "to", type: "address" }] },
      message: { to: "TML5f7kUCYNYk8xiVPbHrVbJEbL2cnFf4e" },
    };
    expect(new TronRpcClient("https://node.invalid").typedDataDigest(payload)).toBe(
      tronUtils.typedData.TypedDataEncoder.hash(payload.domain, payload.types, payload.message),
    );
  });

  it("classifies a payload it cannot hash", () => {
    expect(() =>
      new TronRpcClient("https://node.invalid").typedDataDigest({
        domain: {},
        types: { Mail: [{ name: "a", type: "nope" }] },
        message: { a: "1" },
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_payload" }));
  });
});
