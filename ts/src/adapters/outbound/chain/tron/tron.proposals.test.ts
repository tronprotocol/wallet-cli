import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Guards the HTTP→domain boundary for proposals, which had no coverage and was silently wrong: the
 * normalizer accepted a parameter MAP and rejected arrays, while `/wallet/listproposals` only ever
 * sends an array. Every proposal therefore reported zero changes — the one field that says what a
 * proposal actually does — and `proposal create --wait` could not identify the proposal it had just
 * created (it matches on the parameter set).
 *
 * The payload below is a verbatim excerpt of mainnet proposal 106 (parameter 94 → 1), so this test
 * fails if the real node shape stops being handled. Service-level fixtures cannot catch that: they
 * mock the port, so they can only re-encode whatever shape the adapter believes in.
 */
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

    // keyed by protocol parameter id, values stringified — the shape the domain maps to names/units
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

  // tronweb's typings describe a map; accepted so a different gateway cannot regress the group.
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

  // Written as RAW json: a JS number literal this large is already rounded before it reaches the
  // stub, so building the payload with JSON.stringify would test nothing.
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
