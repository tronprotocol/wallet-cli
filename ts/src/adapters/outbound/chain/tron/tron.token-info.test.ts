import { describe, it, expect } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

const word = (hex: string) => hex.padStart(64, "0");
// Dynamic ABI string: offset, byte length, then padded UTF-8.
const dynamicString = (text: string) => {
  const bytes = Buffer.from(text, "utf8").toString("hex");
  return (
    word("20") +
    word((bytes.length / 2).toString(16)) +
    bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")
  );
};
// Legacy bytes32: right-padded UTF-8.
const bytes32 = (text: string) => Buffer.from(text, "utf8").toString("hex").padEnd(64, "0");

// A missing view can return result:true with empty constant_result.
const stub = (responses: Record<string, string>) => {
  const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1", 200));
  tronweb.transactionBuilder.triggerConstantContract = ((_contract: string, fn: string) => {
    const hex = responses[fn];
    if (hex === undefined) {
      return Promise.resolve({
        result: { result: true, message: "REVERT opcode executed" },
        constant_result: [""],
      });
    }
    return Promise.resolve({ result: { result: true }, constant_result: [hex] });
  }) as never;
  return client;
};

const notAContract = () => {
  const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1", 200));
  tronweb.transactionBuilder.triggerConstantContract = (() =>
    Promise.reject(new Error("Smart contract is not exist."))) as never;
  return client;
};

const unreachable = () => {
  const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1", 200));
  tronweb.transactionBuilder.triggerConstantContract = (() =>
    Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:1"))) as never;
  return client;
};

describe("TronRpcClient.getTokenInfo", () => {
  it("decodes metadata from view calls without relying on a published ABI", async () => {
    const client = stub({
      "name()": dynamicString("Usdd Stablecoin"),
      "symbol()": dynamicString("USDD"),
      "decimals()": word("12"),
      "totalSupply()": word("de0b6b3a7640000"),
    });

    await expect(client.getTokenInfo(CONTRACT)).resolves.toEqual({
      contract: CONTRACT,
      name: "Usdd Stablecoin",
      symbol: "USDD",
      decimals: 18,
      totalSupply: "1000000000000000000",
    });
  });

  it("decodes legacy bytes32 name/symbol returns", async () => {
    const client = stub({
      "name()": bytes32("Legacy Token"),
      "symbol()": bytes32("LEG"),
      "decimals()": word("6"),
      "totalSupply()": word("64"),
    });

    await expect(client.getTokenInfo(CONTRACT)).resolves.toMatchObject({
      name: "Legacy Token",
      symbol: "LEG",
      decimals: 6,
      totalSupply: "100",
    });
  });

  it("leaves fields undefined when the contract does not implement the view", async () => {
    const client = stub({ "symbol()": dynamicString("USDT") });

    await expect(client.getTokenInfo(CONTRACT)).resolves.toEqual({
      contract: CONTRACT,
      name: undefined,
      symbol: "USDT",
      decimals: undefined,
      totalSupply: undefined,
    });
  });

  it("propagates a transport failure instead of reporting absent metadata", async () => {
    await expect(unreachable().getTokenInfo(CONTRACT)).rejects.toMatchObject({
      code: "rpc_error",
      kind: "execution",
    });
  });

  it("classifies 'no contract at this address' as missing token metadata", async () => {
    await expect(notAContract().getTokenInfo(CONTRACT)).rejects.toMatchObject({
      code: "token_metadata_unavailable",
      message: expect.stringContaining("may not be a token contract"),
    });
  });

  it("classifies a reverted view call the same way", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1", 200));
    tronweb.transactionBuilder.triggerConstantContract = (() =>
      Promise.reject(new Error("REVERT opcode executed"))) as never;

    await expect(client.getTokenInfo(CONTRACT)).rejects.toMatchObject({
      code: "token_metadata_unavailable",
    });
  });
});
