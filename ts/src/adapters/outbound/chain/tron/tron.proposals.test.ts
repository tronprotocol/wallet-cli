import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const MAINNET_106 = JSON.stringify({
  proposals: [
    {
      proposal_id: 106,
      proposer_address: "41456798cb4ab28109d8cc643cd7da7bd6069ceae9",
      parameters: [{ key: 94, value: 1 }],
      expiration_time: 1775822400000,
      create_time: 1775543550000,
      approvals: ["41456798cb4ab28109d8cc643cd7da7bd6069ceae9"],
      state: "APPROVED",
    },
  ],
});

function stubNode(body: string) {
  const fetch = vi.fn(
    async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("TronRpcClient.getProposals", () => {
  it("keeps the parameter changes the node sends as an array", async () => {
    stubNode(MAINNET_106);
    const [proposal] = await new TronRpcClient("https://node.invalid", 1000).getProposals();

    expect(proposal!.parameters).toEqual({ "94": "1" });
    expect(proposal!.id).toBe(106);
    expect(proposal!.state).toBe("APPROVED");
    expect(proposal!.proposerAddress).toBe("TGJBjL8wmRVyRStkghnhcVNYYgn6Yjno6X");
    expect(proposal!.approvals).toEqual(["TGJBjL8wmRVyRStkghnhcVNYYgn6Yjno6X"]);
  });

  it("keeps every entry of a multi-parameter proposal", async () => {
    stubNode(
      JSON.stringify({
        proposals: [
          {
            proposal_id: 7,
            proposer_address: "41456798cb4ab28109d8cc643cd7da7bd6069ceae9",
            parameters: [
              { key: 3, value: 15 },
              { key: 2, value: 200000 },
            ],
            expiration_time: 1,
            create_time: 0,
            approvals: [],
            state: "PENDING",
          },
        ],
      }),
    );
    const [proposal] = await new TronRpcClient("https://node.invalid", 1000).getProposals();
    expect(proposal!.parameters).toEqual({ "3": "15", "2": "200000" });
  });

  it("also accepts a parameter map keyed by id", async () => {
    stubNode(
      JSON.stringify({
        proposals: [
          {
            proposal_id: 8,
            proposer_address: "41456798cb4ab28109d8cc643cd7da7bd6069ceae9",
            parameters: { "3": 15 },
            expiration_time: 1,
            create_time: 0,
            approvals: [],
            state: "PENDING",
          },
        ],
      }),
    );
    const [proposal] = await new TronRpcClient("https://node.invalid", 1000).getProposals();
    expect(proposal!.parameters).toEqual({ "3": "15" });
  });

  // Use raw JSON: a JS number literal would round before reaching the parser.
  it("preserves a parameter value beyond Number.MAX_SAFE_INTEGER as an exact string", async () => {
    stubNode(`{
      "proposals": [{
        "proposal_id": 9,
        "proposer_address": "41456798cb4ab28109d8cc643cd7da7bd6069ceae9",
        "parameters": [{ "key": 61, "value": 9007199254740993 }],
        "expiration_time": 1,
        "create_time": 0,
        "approvals": [],
        "state": "PENDING"
      }]
    }`);
    const [proposal] = await new TronRpcClient("https://node.invalid", 1000).getProposals();
    expect(proposal!.parameters["61"]).toBe("9007199254740993");
  });

  it("yields no changes — not a crash — when the node omits parameters entirely", async () => {
    stubNode(
      JSON.stringify({
        proposals: [
          {
            proposal_id: 10,
            proposer_address: "41456798cb4ab28109d8cc643cd7da7bd6069ceae9",
            expiration_time: 1,
            create_time: 0,
            approvals: [],
            state: "CANCELED",
          },
        ],
      }),
    );
    const [proposal] = await new TronRpcClient("https://node.invalid", 1000).getProposals();
    expect(proposal!.parameters).toEqual({});
  });
});
