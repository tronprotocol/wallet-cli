import { describe, it, expect } from "vitest";
import { TronRpcClient } from "./tron.js";

const CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

const word = (hex: string) => hex.padStart(64, "0");
/** ABI encoding of a dynamic `string` return: offset, length, then padded utf8 bytes. */
const dynamicString = (text: string) => {
  const bytes = Buffer.from(text, "utf8").toString("hex");
  return word("20") + word((bytes.length / 2).toString(16))
    + bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
};
/** Legacy `bytes32` return: right-padded utf8 in a single word. */
const bytes32 = (text: string) =>
  Buffer.from(text, "utf8").toString("hex").padEnd(64, "0");

const stub = (responses: Record<string, string>) => {
  const client = new TronRpcClient("http://localhost:1", 200);
  client.tronweb.transactionBuilder.triggerConstantContract = ((
    _contract: string, fn: string,
  ) => {
    const hex = responses[fn];
    if (hex === undefined) return Promise.resolve({ result: { result: false, message: "" } });
    return Promise.resolve({ result: { result: true }, constant_result: [hex] });
  }) as never;
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

  it("leaves fields undefined when their view call reverts", async () => {
    const client = stub({ "symbol()": dynamicString("USDT") });

    await expect(client.getTokenInfo(CONTRACT)).resolves.toEqual({
      contract: CONTRACT,
      name: undefined,
      symbol: "USDT",
      decimals: undefined,
      totalSupply: undefined,
    });
  });
});
