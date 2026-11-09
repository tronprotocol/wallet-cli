import { describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";
import { sunAmount } from "../../../../domain/amounts/index.js";

const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";
const BUILT = { raw_data: { contract: [{ type: "CreateSmartContract" }] } };

function deployWith(abi: unknown) {
  const { client, tronweb } = withTronWeb(() => new TronRpcClient("https://node.invalid"));
  const create = vi.fn(async () => BUILT);
  tronweb.transactionBuilder.createSmartContract = create as never;
  const run = () =>
    client.deployContract(OWNER, { abi, bytecode: "6080", feeLimit: sunAmount("1000000") });
  return { run, create };
}

const ctor = (over: Record<string, unknown> = {}) => [
  { type: "constructor", inputs: [{ name: "x", type: "uint256" }], ...over },
];

describe("TronRpcClient.deployContract — ABI constructor guard", () => {
  it.each([
    ["no constructor", [{ type: "function", name: "f" }]],
    ["a nonpayable constructor", ctor({ stateMutability: "nonpayable" })],
    ["a payable constructor", ctor({ stateMutability: "payable" })],
    ["an empty-string stateMutability, which TronWeb accepts", ctor({ stateMutability: "" })],
    [
      "an { entrys } wrapper with a well-formed constructor",
      { entrys: [{ type: "constructor", stateMutability: "nonpayable" }] },
    ],
    ["an ABI that is neither array nor { entrys }", { foo: 1 }],
  ])("passes %s to TronWeb", async (_label, abi) => {
    const { run, create } = deployWith(abi);
    await expect(run()).resolves.toBe(BUILT);
    expect(create).toHaveBeenCalledOnce();
  });

  it.each([
    ["absent", ctor()],
    ["null", ctor({ stateMutability: null })],
    ["a number", ctor({ stateMutability: 1 })],
    ["a boolean", ctor({ stateMutability: false })],
    ["an object", ctor({ stateMutability: {} })],
    ["absent, with no inputs key", [{ type: "constructor" }]],
    ["absent, inside { entrys }", { entrys: [{ type: "constructor" }] }],
  ])("rejects a constructor whose stateMutability is %s", async (_label, abi) => {
    const { run, create } = deployWith(abi);
    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("stateMutability"),
    });
    expect(create).not.toHaveBeenCalled();
  });
});
