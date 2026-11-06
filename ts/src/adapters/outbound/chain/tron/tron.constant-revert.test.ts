import { describe, it, expect } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const OWNER = "TJmka325yjJKeFpQDwKSQAoNwEyNGhsaEV";
const CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
// Error(string) "Invalid token ID", as Nile returns it for a missing V3 position.
const REVERT_DATA =
  "08c379a0" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000010" +
  "496e76616c696420746f6b656e20494400000000000000000000000000000000";

// Reply shapes captured from Nile /wallet/triggerconstantcontract.
const reverted = (data: string) => ({
  transaction: { ret: [{ ret: "FAILED" }] },
  constant_result: [data],
  result: { result: true, message: "REVERT opcode executed" },
  energy_used: 1984,
});
const notAContract = {
  result: { code: "CONTRACT_VALIDATE_ERROR", message: "Smart contract is not exist." },
};

const answering = (body: unknown) => {
  const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1"));
  tronweb.fullNode.instance.request = (async () => ({ data: body })) as never;
  return client;
};

const estimate = (client: TronRpcClient) =>
  client.estimateEnergy(OWNER, CONTRACT, "transfer(address,uint256)", []);
const call = (client: TronRpcClient) =>
  client.triggerConstantContract(CONTRACT, "positions(uint256)", []);

describe("TronRpcClient constant-call classification", () => {
  it.each([
    ["estimateEnergy", estimate],
    ["triggerConstantContract", call],
  ])("%s reports a revert without revert data as execution_reverted", async (_, run) => {
    const error = await run(answering(reverted(""))).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "execution_reverted" });
    expect((error as { details?: unknown }).details).toBeUndefined();
  });

  it.each([
    ["estimateEnergy", estimate],
    ["triggerConstantContract", call],
  ])("%s keeps the revert data", async (_, run) => {
    await expect(run(answering(reverted(REVERT_DATA)))).rejects.toMatchObject({
      code: "execution_reverted",
      details: { revertData: `0x${REVERT_DATA}` },
    });
  });

  it.each([
    ["estimateEnergy", estimate],
    ["triggerConstantContract", call],
  ])("%s keeps a node API error as rpc_error", async (_, run) => {
    await expect(run(answering(notAContract))).rejects.toMatchObject({ code: "rpc_error" });
  });

  it("reports a node API error without a message as rpc_error", async () => {
    await expect(call(answering({ result: { code: "OTHER_ERROR" } }))).rejects.toMatchObject({
      code: "rpc_error",
      message: expect.stringContaining("OTHER_ERROR"),
    });
  });

  it("reports a non-JSON reply as invalid_node_response", async () => {
    await expect(call(answering("{oops not json"))).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  it("reports a reply without a call result as invalid_node_response", async () => {
    await expect(call(answering({}))).rejects.toMatchObject({ code: "invalid_node_response" });
  });

  it("classifies a revert of a token view as missing token metadata", async () => {
    await expect(answering(reverted(REVERT_DATA)).getTokenInfo(CONTRACT)).rejects.toMatchObject({
      code: "token_metadata_unavailable",
    });
  });
});
