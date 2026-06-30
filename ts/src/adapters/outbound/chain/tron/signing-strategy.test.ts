import { describe, it, expect } from "vitest";
import { TronWeb } from "tronweb";
import { tronSignStrategy } from "./signing-strategy.js";

// Well-known test key; never holds funds.
const PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
const oldTw = new TronWeb({ fullHost: "http://localhost" });

describe("tronSignStrategy — static utils signing parity", () => {
  it("signMessage matches the old instance trx.signMessageV2 byte-for-byte", async () => {
    const got = await tronSignStrategy.signMessage(PK, "hello world");
    const ref = oldTw.trx.signMessageV2("hello world", PK.slice(2));
    expect(got).toBe(ref);
  });

  it("sign attaches a valid secp256k1 signature to a transaction", async () => {
    // Static signTransaction skips the instance's owner_address pre-check, so a minimal
    // tx is enough; it appends signature[] over the txID hash.
    const tx = { txID: "ab".repeat(32), raw_data: { contract: [] }, raw_data_hex: "0a02" };
    const got = await tronSignStrategy.sign(PK, structuredClone(tx) as any);
    expect(Array.isArray((got as any).signature)).toBe(true);
    expect((got as any).signature[0]).toMatch(/^[0-9a-fA-F]{130}$/); // 65-byte r||s||v
  });

  it("wraps signing failures in a ChainError(signing_rejected)", async () => {
    await expect(tronSignStrategy.signMessage(PK, undefined as any)).rejects.toMatchObject({
      code: "signing_rejected",
    });
  });
});
