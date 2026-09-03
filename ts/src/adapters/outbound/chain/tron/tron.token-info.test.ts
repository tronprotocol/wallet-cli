import { describe, it, expect } from "vitest";
import { TronRpcClient } from "./tron.js";

const CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

const word = (hex: string) => hex.padStart(64, "0");
/** ABI encoding of a dynamic `string` return: offset, length, then padded utf8 bytes. */
const dynamicString = (text: string) => {
  const bytes = Buffer.from(text, "utf8").toString("hex");
  return (
    word("20") +
    word((bytes.length / 2).toString(16)) +
    bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")
  );
};
/** Legacy `bytes32` return: right-padded utf8 in a single word. */
const bytes32 = (text: string) => Buffer.from(text, "utf8").toString("hex").padEnd(64, "0");

/**
 * Node response shapes, as measured against a live Nile node rather than assumed:
 *
 *   method implemented   → { result: { result: true } }, constant_result: ["<abi hex>"]
 *   method NOT there     → { result: { result: true, message: "REVERT opcode executed" } },
 *                          constant_result: [""]          ← still result:true
 *   address is no contract → { result: { code: "CONTRACT_VALIDATE_ERROR", … } }, no constant_result
 *   node unreachable     → the request itself rejects
 *
 * The second row is the one that matters: a missing view method is not an error at this layer, so
 * it needs no rescue — it decodes to undefined on its own.
 */
const stub = (responses: Record<string, string>) => {
  const client = new TronRpcClient("http://localhost:1", 200);
  client.tronweb.transactionBuilder.triggerConstantContract = ((_contract: string, fn: string) => {
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

/**
 * No contract at that address. The node reports `CONTRACT_VALIDATE_ERROR` in a 200 body, but tronweb
 * turns that into a rejection rather than handing it back — verified against a live Nile node, where
 * an EOA address surfaces as `rpc_error`, not `execution_error`.
 */
const notAContract = () => {
  const client = new TronRpcClient("http://localhost:1", 200);
  client.tronweb.transactionBuilder.triggerConstantContract = (() =>
    Promise.reject(new Error("Smart contract is not exist."))) as never;
  return client;
};

/** the request never reached a node. */
const unreachable = () => {
  const client = new TronRpcClient("http://localhost:1", 200);
  client.tronweb.transactionBuilder.triggerConstantContract = (() =>
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

  // A node outage used to surface as "this token has no metadata", which GasFree then escalated to
  // gasfree_integrity ("the provider is lying") and tx send reported as a usage error at exit 2.
  it("propagates a transport failure instead of reporting absent metadata", async () => {
    await expect(unreachable().getTokenInfo(CONTRACT)).rejects.toMatchObject({
      code: "rpc_error",
      kind: "execution",
    });
  });

  /**
   * "No contract at this address" is not a network fault, and it used to be reported as one
   * (`rpc_error`) — which reads as "the node is broken" when the truth is "that address holds no
   * token". It is now classified, and the code matches what the EVM side answers for the same
   * situation so a caller can branch on one value across both families.
   *
   * The test above is the other half of the pair and must keep passing: a transport failure is
   * still `rpc_error`. Classification here means naming two known node answers, not catching
   * everything — the difference the getTokenInfo comment exists to protect.
   */
  it("classifies 'no contract at this address' as missing token metadata", async () => {
    await expect(notAContract().getTokenInfo(CONTRACT)).rejects.toMatchObject({
      code: "token_metadata_unavailable",
      message: expect.stringContaining("may not be a token contract"),
    });
  });

  it("classifies a reverted view call the same way", async () => {
    const client = new TronRpcClient("http://localhost:1", 200);
    client.tronweb.transactionBuilder.triggerConstantContract = (() =>
      Promise.reject(new Error("REVERT opcode executed"))) as never;

    await expect(client.getTokenInfo(CONTRACT)).rejects.toMatchObject({
      code: "token_metadata_unavailable",
    });
  });
});
