import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronProposal } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { TronProposalService } from "./proposal-service.js";

const NET: NetworkDescriptor = { id: "tron:nile", family: "tron", chainId: "nile", aliases: [], capabilities: [] };
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

function createService(gateway: Partial<TronGateway>, run?: (params: TxPipelineParams) => Promise<never>) {
  const concrete = gateway as TronGateway;
  const gateways = { get: () => concrete } as unknown as ChainGatewayProvider;
  const pipeline = {
    assertCanSign: vi.fn(),
    run: run ?? (async (params: TxPipelineParams) => {
      await params.build(OWNER);
      return { stage: "submitted", txId: "tx-proposal" } as never;
    }),
  } as unknown as TxPipeline;
  return { service: new TronProposalService(gateways, pipeline), pipeline };
}

describe("TronProposalService", () => {
  it("filters active proposals, sorts ids, paginates, and uses Java's 70% threshold", async () => {
    const now = Date.now();
    const { service } = createService({
      getProposals: async () => ([
        { id: 1, proposerAddress: OWNER, parameters: { "3": "15" }, expirationTime: now - 1, createTime: now - 2, approvals: [], state: "DISAPPROVED" },
        { id: 3, proposerAddress: OWNER, parameters: { "3": "15", "2": "200000" }, expirationTime: now + 60_000, createTime: now, approvals: [OTHER], state: "PENDING" },
        { id: 2, proposerAddress: OTHER, parameters: { "20": "1" }, expirationTime: now + 60_000, createTime: now, approvals: [], state: "PENDING" },
      ] as TronProposal[]),
      getChainParameters: async () => [
        { key: "getCreateAccountFee", value: 100_000 },
        { key: "getTransactionFee", value: 10 },
        { key: "getAllowMultiSign", value: 0 },
      ],
      getWitnesses: async () => Array.from({ length: 27 }, (_, index) => ({ address: `${OWNER}${index}`, voteCount: "0" })),
    });

    await expect(service.list(NET, { state: "active", offset: 1, limit: 1 })).resolves.toMatchObject({
      approvalThreshold: 18,
      pagination: { offset: 1, limit: 1, total: 2 },
      proposals: [{ id: 2, state: "voting", changes: [{ id: 20, name: "getAllowMultiSign" }] }],
    });
  });

  it("maps --cancel to Java is_add_approval=false and preserves permission/expiration", async () => {
    const build = vi.fn(async () => ({ raw_data: { contract: [{ type: "ProposalApproveContract" }] } }));
    const extend = vi.fn(async (tx) => ({ ...tx as object, extended: true }));
    const { service } = createService({
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
      getWitnesses: async () => Array.from({ length: 27 }, () => ({ address: OTHER, voteCount: "1" })),
      buildProposalApprove: build,
      extendTransactionExpiration: extend,
    });

    await expect(service.approve(scope, NET, {
      id: 47,
      cancel: true,
      permissionId: 2,
      expiration: 120_000,
      signOnly: true,
    })).resolves.toMatchObject({ addApproval: false, approvals: 0, approvalThreshold: 18 });
    expect(build).toHaveBeenCalledWith(OWNER, 47, false, { permissionId: 2 });
    expect(extend).toHaveBeenCalledWith(expect.anything(), 120_000);
  });

  it("rejects a non-witness before proposal creation is built", async () => {
    const build = vi.fn();
    const { service } = createService({
      getChainParameters: async () => [],
      getWitness: async () => null,
      buildProposalCreate: build,
    });
    await expect(service.create(scope, NET, {
      set: ["getTransactionFee=15"], permissionId: 0,
    })).rejects.toMatchObject({ code: "not_a_witness" });
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
    await expect(service.delete(scope, NET, { id: 48, permissionId: 0 }))
      .rejects.toMatchObject({ code: "not_proposal_owner" });
  });
});
