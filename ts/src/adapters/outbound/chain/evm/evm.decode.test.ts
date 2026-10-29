import { describe, expect, it } from "vitest";
import { decodeEvmRawTransaction, evmTransactionChainId } from "./evm.js";

// Sepolia, nonce 0, 0.001 ETH to 0x…dEaD, no signature.
const UNSIGNED =
  "0x02f083aa36a780830f4240847944848282520894000000000000000000000000000000000000dead87038d7ea4c6800080c0";
// Mainnet, signed.
const SIGNED_MAINNET =
  "0x02f8700180830f42408478fbb08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c080a0bf5dda9670fd52be2346cdb74cdd238a51a4ae67ac7513fd7540fd78eca31d25a026903a9fcb8d75c83ff1e0177a8dd7061e0ddc7051500a6f1a041be1a2e32ca3";

describe("decodeEvmRawTransaction", () => {
  it("reads an unsigned transaction's chain and fields", () => {
    const tx = decodeEvmRawTransaction(UNSIGNED);
    expect(tx).toMatchObject({
      chainId: "11155111",
      signed: false,
      to: "0x000000000000000000000000000000000000dEaD",
      nonce: 0,
      valueWei: "1000000000000000",
    });
    expect(tx).not.toHaveProperty("hash");
  });

  it("reads a signed transaction's sender, hash and serialisation", () => {
    const tx = decodeEvmRawTransaction(SIGNED_MAINNET);
    expect(tx).toMatchObject({ chainId: "1", signed: true, serialized: SIGNED_MAINNET });
    expect(tx.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(tx.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("refuses bytes that are not a transaction", () => {
    expect(() => decodeEvmRawTransaction("0x1234")).toThrow(
      expect.objectContaining({ code: "invalid_transaction" }),
    );
  });
});

describe("evmTransactionChainId", () => {
  it("reads the chain id of a decoded transaction", () => {
    expect(evmTransactionChainId(decodeEvmRawTransaction(UNSIGNED).transaction)).toBe("11155111");
  });

  it("reports a transaction without a chain id as naming none", () => {
    expect(evmTransactionChainId({ to: "0x000000000000000000000000000000000000dEaD" })).toBe(
      undefined,
    );
  });
});
