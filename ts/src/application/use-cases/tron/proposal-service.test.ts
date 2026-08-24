import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronProposal } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { TronProposalService } from "./proposal-service.js";

const NET: NetworkDescriptor = {
  id: "tron:nile",
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
  run?: (params: TxPipelineParams) => Promise<never>,
) {
  const concrete = gateway as TronGateway;
  const gateways = { get: () => concrete } as unknown as ChainGatewayProvider;
  const captured: TxPipelineParams[] = [];
  const pipeline = {
    assertCanSign: vi.fn(),
    run:
      run ??
      (async (params: TxPipelineParams) => {
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
      // no getChainParameters stub: listing must not reach for the values in effect now.
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
    const build = vi.fn(async () => ({
      raw_data: { contract: [{ type: "ProposalApproveContract" }] },
    }));
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

/**
 * The chain does not put the new proposal's id in the receipt, so `--wait` has to find it by looking
 * at the list afterwards. Matching on proposer + parameter set is not enough to identify it: on
 * mainnet, 10 of 106 proposals (9.4%) share a proposer and an identical parameter set with another,
 * because a rejected proposal gets re-submitted unchanged. `findCreatedProposal` also never filtered
 * by state, so every historical one stayed a candidate, and it resolved ties by taking the highest
 * id — right whenever the list is fresh, and wrong in the case that needs no hostile node at all:
 *
 *   confirmation reads the fullnode's unsolidified data (~3s), the proposal list lags behind it, and
 *   the caller had proposed these same parameters before. The new proposal is not listed yet, the
 *   old one is, so the "highest match" IS the old one — and its id is handed back as the new
 *   proposal's, to be passed to `proposal approve` or the irreversible `proposal delete`.
 *
 * Comparing against a snapshot taken before submitting is what separates "already there" from "just
 * appeared". Anything other than exactly one new match is reported as unknown rather than guessed.
 */
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
      warn: (m: string) => warnings.push(String(m)),
    } as typeof scope;
    const { service } = createService(
      {
        getChainParameters: async () => [{ key: "getTransactionFee", value: 10 }],
        getWitness: async () => ({ address: OWNER, voteCount: "1" }),
        buildProposalCreate: async () => ({
          raw_data: { contract: [{ type: "ProposalCreateContract" }] },
        }),
        getProposals: async () => listings[Math.min(calls.push(1) - 1, listings.length - 1)]!,
      },
      async () => ({ stage: "confirmed", txId: "tx", confirmed: true }) as never,
    );
    return { service, waiting, warnings, listCalls: () => calls.length };
  }

  it("returns the proposal that appeared, not the highest id that matches", async () => {
    // 41 already exists with identical parameters; 42 is the one just created.
    const h = harness([[proposal(41)], [proposal(41), proposal(42)]]);
    const out = await h.service.create(h.waiting, NET, { set: ["getTransactionFee=15"] } as never);
    expect(out).toMatchObject({ proposalId: 42 });
  });

  it("admits it cannot tell when the list has not caught up, instead of naming the old one", async () => {
    // The realistic failure: nothing new is listed yet, but a prior identical proposal is.
    const h = harness([[proposal(41)], [proposal(41)]]);
    const out = (await h.service.create(h.waiting, NET, {
      set: ["getTransactionFee=15"],
    } as never)) as { proposalId?: number };

    expect(out.proposalId).toBeUndefined();
    expect(h.warnings.join(" ")).toMatch(/could not|unable|not identify/i);
  });

  it("admits it cannot tell when two identical proposals appeared at once", async () => {
    const h = harness([[proposal(41)], [proposal(41), proposal(42), proposal(43)]]);
    const out = (await h.service.create(h.waiting, NET, {
      set: ["getTransactionFee=15"],
    } as never)) as { proposalId?: number };

    expect(out.proposalId).toBeUndefined();
    expect(h.warnings.join(" ")).toBeTruthy();
  });

  it("does not pay for a snapshot when no confirmation was asked for", async () => {
    const h = harness([[proposal(41)]]);
    const notWaiting = { ...h.waiting, wait: false } as typeof scope;
    await h.service.create(notWaiting, NET, { set: ["getTransactionFee=15"] } as never);
    expect(h.listCalls()).toBe(0);
  });
});
