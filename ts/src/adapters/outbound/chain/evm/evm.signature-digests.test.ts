import { describe, expect, it } from "vitest";
import { Transaction, TypedDataEncoder, Wallet } from "ethers";
import { EvmRpcClient } from "./evm.js";
import type { UnsignedTx } from "../../../../domain/types/index.js";

const client = new EvmRpcClient("https://node.invalid");
const TX = {
  type: 2,
  to: "0x000000000000000000000000000000000000dEaD",
  nonce: 0,
  gasLimit: "21000",
  maxFeePerGas: "1000000000",
  maxPriorityFeePerGas: "1",
  chainId: 11155111,
} as UnsignedTx;

describe("EvmRpcClient signature digests", () => {
  it("returns the unsigned hash and signature of a signed serialization", async () => {
    const raw = await Wallet.createRandom().signTransaction(TX as never);
    const parsed = Transaction.from(raw);
    expect(client.unsignedTransactionHash(TX)).toBe(parsed.unsignedHash);
    expect(client.signedTransactionParts(raw)).toEqual({
      unsignedHash: parsed.unsignedHash,
      signature: parsed.signature!.serialized,
    });
  });

  it("returns no parts for unsigned or malformed bytes", () => {
    expect(client.signedTransactionParts(Transaction.from(TX as never).unsignedSerialized)).toBe(
      undefined,
    );
    expect(client.signedTransactionParts("0x02")).toBeUndefined();
  });

  it("hashes typed data without a declared EIP712Domain type", () => {
    const types = { Mail: [{ name: "contents", type: "string" }] };
    const payload = {
      domain: { name: "T", chainId: 1 },
      types: { ...types, EIP712Domain: [{ name: "name", type: "string" }] },
      message: { contents: "hi" },
    };
    expect(client.typedDataDigest(payload)).toBe(
      TypedDataEncoder.hash(payload.domain, types, payload.message),
    );
  });
});
