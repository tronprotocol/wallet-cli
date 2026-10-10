/**
 * Recovery, pinned against TronWeb.
 *
 * Nothing here is invented. `DIGEST` is the EIP-712 hash TronWeb's own `TypedDataEncoder` produced
 * for the live Permit2 payload, and `SIGNATURE` is what its `signTypedData` produced over that
 * payload with private key 1 — whose address is the well-known
 * `TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC`. So this holds our recovery against the library that will
 * be doing the signing, rather than against itself.
 */
import { describe, expect, it } from "vitest";
import { recoverTronSigner } from "./permit2-recover.js";

const DIGEST = "0xf3517c8388ec6f00f660712eb0bd9ded80715efcb0fbb26eee9a34a5ea02ed71";
const SIGNER = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
/** r || s || v over DIGEST, from TronWeb's signTypedData with private key 1. v is 0x1c. */
const SIGNATURE =
  "0xa4dc1b481f23aed891caa51b9335f26a1a324231ca6f574e9036f001556f97d562705a517379bae09a9d5e0bf8917af1697602b6f9a7e3dd2039eaf89f239c621c";

describe("recovering the signer", () => {
  it("recovers the address TronWeb signed with", () => {
    expect(recoverTronSigner(DIGEST, SIGNATURE)).toBe(SIGNER);
  });

  it("accepts the hex with or without 0x, in either case", () => {
    expect(recoverTronSigner(DIGEST.slice(2), SIGNATURE.slice(2).toUpperCase())).toBe(SIGNER);
  });

  /**
   * A Ledger reports the parity and ethers reports 27/28. Rejecting either form would mean the
   * owner check silently does not happen on one of the two signers.
   */
  it("accepts a bare parity byte as well as 27/28", () => {
    const parity = `${SIGNATURE.slice(0, -2)}01`;
    expect(recoverTronSigner(DIGEST, parity)).toBe(SIGNER);
  });

  // The check has to be able to FAIL, not merely to pass: a different digest must not recover to
  // the same account.
  it("recovers somebody else from a digest that was not signed", () => {
    const other = `0x${"11".repeat(32)}`;
    expect(recoverTronSigner(other, SIGNATURE)).not.toBe(SIGNER);
  });

  it("rejects a signature of the wrong length", () => {
    expect(() => recoverTronSigner(DIGEST, "0xabcd")).toThrow(/2 bytes, not the 65/);
  });

  it("rejects a digest that is not 32 bytes", () => {
    expect(() => recoverTronSigner("0xabcd", SIGNATURE)).toThrow(/2 bytes, not 32/);
  });

  it("rejects a recovery byte that is neither a parity nor 27/28", () => {
    const bad = `${SIGNATURE.slice(0, -2)}05`;
    expect(() => recoverTronSigner(DIGEST, bad)).toThrow(/neither a parity nor 27\/28/);
  });

  it("fails with signing_rejected, never silently", () => {
    expect(() => recoverTronSigner(DIGEST, "0x00")).toThrow(
      expect.objectContaining({ code: "signing_rejected" }),
    );
  });
});
