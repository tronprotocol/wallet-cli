import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronProposal } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TronTxPipelineParams } from "../../services/pipeline/index.js";
import { TronProposalService } from "./proposal-service.js";
import { isUserMessage } from "../../../domain/errors/index.js";
import { cliMessage } from "../../../adapters/inbound/cli/output/errors.js";

const NET: NetworkDescriptor = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const OTHER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

function createService(
  gateway: Partial<TronGateway>,
  run?: (params: TronTxPipelineParams) => Promise<never>,
) {
  const concrete = gateway as TronGateway;
  const gateways = { get: () => concrete } as unknown as ChainGatewayProvider;
  const captured: TronTxPipelineParams[] = [];
  const pipeline = {
    assertCanSign: vi.fn(),
    runTron:
      run ??
      (async (params: TronTxPipelineParams) => {
        captured.push(params);
        await params.build(OWNER);
        return { stage: "submitted", txId: "tx-proposal" } as never;
      }),
  } as unknown as TxPipeline;
  return { service: new TronProposalService(gateways, pipeline), pipeline, captured };
}

describe("TronProposalService", () => {
  it("filters active proposals, sorts ids, paginates, and uses Java's 70% threshold", async () => {
    const now = Date.now();
    const { service } = createService({
      getProposals: async () =>
        [
          {
            id: 1,
            proposerAddress: OWNER,
            parameters: { "3": "15" },
            expirationTime: now - 1,
            createTime: now - 2,
            approvals: [],
            state: "DISAPPROVED",
          },
          {
            id: 3,
            proposerAddress: OWNER,
            parameters: { "3": "15", "2": "200000" },
            expirationTime: now + 60_000,
            createTime: now,
            approvals: [OTHER],
            state: "PENDING",
          },
          {
            id: 2,
            proposerAddress: OTHER,
            parameters: { "20": "1" },
            expirationTime: now + 60_000,
            createTime: now,
            approvals: [],
            state: "PENDING",
          },
        ] as TronProposal[],
      // Listing must not query current chain parameter values.
      getWitnesses: async () =>
        Array.from({ length: 27 }, (_, index) => ({ address: `${OWNER}${index}`, voteCount: "0" })),
    });

    await expect(
      service.list(NET, { state: "active", offset: 1, limit: 1 }),
    ).resolves.toMatchObject({
      approvalThreshold: 18,
      pagination: { offset: 1, limit: 1, total: 2 },
      proposals: [
        { id: 2, state: "voting", parameters: [{ id: 20, name: "getAllowMultiSign", value: 1 }] },
      ],
    });
  });

  it("maps --cancel to Java is_add_approval=false and preserves permission/expiration", async () => {
    const build = vi.fn(
      async () => ({ raw_data: { contract: [{ type: "ProposalApproveContract" }] } }) as never,
    );
    const { service, captured } = createService({
      getProposal: async () => ({
        id: 47,
        proposerAddress: OTHER,
        parameters: { "3": "15" },
        expirationTime: Date.now() + 60_000,
        createTime: Date.now(),
        approvals: [OWNER],
        state: "PENDING",
      }),
      getWitness: async () => ({ address: OWNER, voteCount: "1" }),
      getWitnesses: async () =>
        Array.from({ length: 27 }, () => ({ address: OTHER, voteCount: "1" })),
      buildProposalApprove: build,
    });

    await expect(
      service.approve(scope, NET, {
        id: 47,
        cancel: true,
        permissionId: 2,
        expiration: 120_000,
        signOnly: true,
      }),
    ).resolves.toMatchObject({ addApproval: false, approvals: 0, approvalThreshold: 18 });
    expect(build).toHaveBeenCalledWith(OWNER, 47, false, { permissionId: 2 });
    expect(captured[0]).toMatchObject({ permissionId: 2, expiration: 120_000 });
    expect(typeof captured[0]!.prepare).toBe("function");
  });

  it("rejects a non-witness before proposal creation is built", async () => {
    const build = vi.fn();
    const { service } = createService({
      getChainParameters: async () => [],
      getWitness: async () => null,
      buildProposalCreate: build,
    });
    await expect(
      service.create(scope, NET, {
        set: ["getTransactionFee=15"],
        permissionId: 0,
      }),
    ).rejects.toMatchObject({ code: "not_a_witness" });
    expect(build).not.toHaveBeenCalled();
  });

  it("rejects delete by an address other than the proposal owner", async () => {
    const { service } = createService({
      getProposal: async () => ({
        id: 48,
        proposerAddress: OTHER,
        parameters: {},
        expirationTime: Date.now() + 60_000,
        createTime: Date.now(),
        approvals: [],
        state: "PENDING",
      }),
      getWitness: async () => ({ address: OWNER, voteCount: "1" }),
    });
    await expect(service.delete(scope, NET, { id: 48, permissionId: 0 })).rejects.toMatchObject({
      code: "not_proposal_owner",
    });
  });
});

describe("proposal create --wait identifies the proposal it created, or admits it cannot", () => {
  const PARAMS = { "3": "15" };
  const proposal = (id: number, over: Partial<TronProposal> = {}): TronProposal =>
    ({
      id,
      proposerAddress: OWNER,
      parameters: PARAMS,
      expirationTime: Date.now() + 60_000,
      createTime: Date.now(),
      approvals: [],
      state: "PENDING",
      ...over,
    }) as TronProposal;

  function harness(listings: TronProposal[][]) {
    const calls: number[] = [];
    const warnings: string[] = [];
    const waiting = {
      ...scope,
      wait: true,
      warn: (m) => warnings.push(isUserMessage(m) ? cliMessage(m).message : String(m)),
    } as typeof scope;
    const { service } = createService(
      {
        getChainParameters: async () => [{ key: "getTransactionFee", value: 10 }],
        getWitness: async () => ({ address: OWNER, voteCount: "1" }),
        buildProposalCreate: async () =>
          ({ raw_data: { contract: [{ type: "ProposalCreateContract" }] } }) as never,
        getProposals: async () => listings[Math.min(calls.push(1) - 1, listings.length - 1)]!,
      },
      async () => ({ stage: "confirmed", txId: "tx", confirmed: true }) as never,
    );
    return { service, waiting, warnings, listCalls: () => calls.length };
  }

  it("returns the proposal that appeared, not the highest id that matches", async () => {
    const h = harness([[proposal(41)], [proposal(41), proposal(42)]]);
    const out = await h.service.create(h.waiting, NET, { set: ["getTransactionFee=15"] } as never);
    expect(out).toMatchObject({ proposalId: 42 });
  });

  it("admits it cannot tell when the list has not caught up, instead of naming the old one", async () => {
    const h = harness([[proposal(41)], [proposal(41)]]);
    const out = (await h.service.create(h.waiting, NET, {
      set: ["getTransactionFee=15"],
    } as never)) as { proposalId?: number };

    expect(out.proposalId).toBeUndefined();
    expect(h.warnings).toEqual([
      "could not identify the created proposal yet: the node's proposal list has not caught up with the confirmation. Find it with `proposal list` — the transaction itself succeeded",
    ]);
  });

  it("admits it cannot tell when two identical proposals appeared at once", async () => {
    const h = harness([[proposal(41)], [proposal(41), proposal(42), proposal(43)]]);
    const out = (await h.service.create(h.waiting, NET, {
      set: ["getTransactionFee=15"],
    } as never)) as { proposalId?: number };

    expect(out.proposalId).toBeUndefined();
    expect(h.warnings).toEqual([
      "could not identify the created proposal: 2 new proposals match these parameters. Find it with `proposal list` before approving or deleting anything",
    ]);
  });

  it("does not pay for a snapshot when no confirmation was asked for", async () => {
    const h = harness([[proposal(41)]]);
    const notWaiting = { ...h.waiting, wait: false } as typeof scope;
    await h.service.create(notWaiting, NET, { set: ["getTransactionFee=15"] } as never);
    expect(h.listCalls()).toBe(0);
  });
});
