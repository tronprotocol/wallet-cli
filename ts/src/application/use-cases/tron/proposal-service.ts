import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import {
  parseChainParameterAssignments,
  proposalParameterChanges,
  type ChainParameterChange,
} from "../../../domain/governance/chain-parameters.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronProposal } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import {
  governanceTransactionMode,
  transactionResource,
  withExtendedExpiration,
  type GovernanceTransactionInput,
} from "./governance-transaction.js";

export interface ProposalListInput {
  state: "active" | "all";
  limit?: number;
  offset: number;
}

export interface ProposalCreateInput extends GovernanceTransactionInput {
  set: string[];
}

export interface ProposalApproveInput extends GovernanceTransactionInput {
  id: number;
  cancel: boolean;
}

export interface ProposalDeleteInput extends GovernanceTransactionInput {
  id: number;
}

type ChainParameters = Awaited<ReturnType<TronGateway["getChainParameters"]>>;

export class TronProposalService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  async list(network: NetworkDescriptor, input: ProposalListInput) {
    const gateway = this.gateways.get(network, "tron");
    const [proposals, parameters, witnesses] = await Promise.all([
      gateway.getProposals(),
      gateway.getChainParameters(),
      gateway.getWitnesses(27),
    ]);
    const approvalThreshold = threshold(witnesses.length);
    const views = proposals
      .filter((proposal) => input.state === "all" || isActive(proposal))
      .sort((left, right) => right.id - left.id)
      .map((proposal) => listView(proposal, parameters));
    const total = views.length;
    const proposalsPage = views.slice(input.offset, input.limit === undefined ? undefined : input.offset + input.limit);
    return {
      approvalThreshold,
      proposals: proposalsPage,
      pagination: { offset: input.offset, limit: input.limit ?? null, total },
    };
  }

  async show(network: NetworkDescriptor, id: number) {
    const gateway = this.gateways.get(network, "tron");
    const [proposal, parameters, witnesses] = await Promise.all([
      gateway.getProposal(id),
      gateway.getChainParameters(),
      gateway.getWitnesses(27),
    ]);
    if (!proposal) throw new ChainError("proposal_not_found", `proposal #${id} was not found`);
    const approvalThreshold = threshold(witnesses.length);
    return {
      ...listView(proposal, parameters),
      createTime: proposal.createTime,
      approvalThreshold,
      reachedThreshold: proposal.approvals.length >= approvalThreshold,
      approvedBy: proposal.approvals,
    };
  }

  async create(scope: TransactionScope, network: NetworkDescriptor, input: ProposalCreateInput) {
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input);
    const owner = scope.resolveAddress("tron");
    const [parameters] = await Promise.all([
      gateway.getChainParameters(),
      assertWitness(gateway, owner),
    ]);
    const changes = parseChainParameterAssignments(input.set, parameters);
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      build: async (address) => withExtendedExpiration(
        gateway,
        await gateway.buildProposalCreate(
          address,
          changes.map((change) => ({ key: change.id, value: change.proposedValue })),
          { permissionId: input.permissionId },
        ),
        input.expiration,
      ),
      estimate: async (_tx: UnsignedTx) => ({ feeModel: "tron-resource", note: "proposal creation uses bandwidth only" }),
    });
    const data = outcomeData(outcome);
    const proposalId = outcome.stage === "confirmed"
      ? await findCreatedProposal(gateway, owner, changes).catch(() => undefined)
      : undefined;
    return {
      kind: "proposal-create" as const,
      ...data,
      proposerAddress: owner,
      ...(proposalId === undefined ? {} : { proposalId }),
      changes,
      ...(transactionResource(data) ? { resource: transactionResource(data) } : {}),
    };
  }

  async approve(scope: TransactionScope, network: NetworkDescriptor, input: ProposalApproveInput) {
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input);
    const owner = scope.resolveAddress("tron");
    const [proposal, witnesses] = await Promise.all([
      requireProposal(gateway, input.id),
      gateway.getWitnesses(27),
      assertWitness(gateway, owner),
    ]);
    assertProposalOpen(proposal);
    const alreadyApproved = proposal.approvals.includes(owner);
    if (!input.cancel && alreadyApproved) {
      throw new ChainError("already_approved", `account already approved proposal #${input.id}`);
    }
    if (input.cancel && !alreadyApproved) {
      throw new ChainError("not_approved", `account has not approved proposal #${input.id}`);
    }
    const addApproval = !input.cancel;
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      build: async (address) => withExtendedExpiration(
        gateway,
        await gateway.buildProposalApprove(address, input.id, addApproval, { permissionId: input.permissionId }),
        input.expiration,
      ),
      estimate: async (_tx: UnsignedTx) => ({ feeModel: "tron-resource", note: "proposal approval uses bandwidth only" }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "proposal-approve" as const,
      ...data,
      proposalId: input.id,
      voterAddress: owner,
      addApproval,
      approvals: proposal.approvals.length + (addApproval ? 1 : -1),
      approvalThreshold: threshold(witnesses.length),
      ...(transactionResource(data) ? { resource: transactionResource(data) } : {}),
    };
  }

  async delete(scope: TransactionScope, network: NetworkDescriptor, input: ProposalDeleteInput) {
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input);
    const owner = scope.resolveAddress("tron");
    const [proposal] = await Promise.all([
      requireProposal(gateway, input.id),
      assertWitness(gateway, owner),
    ]);
    if (proposal.state === "CANCELED") {
      throw new ChainError("already_canceled", `proposal #${input.id} is already canceled`);
    }
    assertProposalOpen(proposal);
    if (proposal.proposerAddress !== owner) {
      throw new ChainError("not_proposal_owner", `only ${proposal.proposerAddress} can delete proposal #${input.id}`);
    }
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      build: async (address) => withExtendedExpiration(
        gateway,
        await gateway.buildProposalDelete(address, input.id, { permissionId: input.permissionId }),
        input.expiration,
      ),
      estimate: async (_tx: UnsignedTx) => ({ feeModel: "tron-resource", note: "proposal deletion uses bandwidth only" }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "proposal-delete" as const,
      ...data,
      proposalId: input.id,
      proposerAddress: owner,
      ...(transactionResource(data) ? { resource: transactionResource(data) } : {}),
    };
  }
}

async function assertWitness(gateway: TronGateway, address: string): Promise<void> {
  if (!await gateway.getWitness(address)) {
    throw new ChainError("not_a_witness", `${address} is not a registered witness`);
  }
}

async function requireProposal(gateway: TronGateway, id: number): Promise<TronProposal> {
  const proposal = await gateway.getProposal(id);
  if (!proposal) throw new ChainError("proposal_not_found", `proposal #${id} was not found`);
  return proposal;
}

function assertProposalOpen(proposal: TronProposal): void {
  if (proposal.state !== "PENDING" || proposal.expirationTime <= Date.now()) {
    throw new ChainError("proposal_expired", `proposal #${proposal.id} is no longer in its voting window`);
  }
}

function isActive(proposal: TronProposal): boolean {
  return proposal.state === "PENDING" && proposal.expirationTime > Date.now();
}

function threshold(activeWitnessCount: number): number {
  return activeWitnessCount > 0 ? Math.max(1, Math.floor(activeWitnessCount * 0.7)) : 18;
}

function stateName(state: TronProposal["state"]): "voting" | "approved" | "disapproved" | "canceled" {
  return ({
    PENDING: "voting",
    APPROVED: "approved",
    DISAPPROVED: "disapproved",
    CANCELED: "canceled",
  } as const)[state];
}

function listView(proposal: TronProposal, parameters: ChainParameters) {
  return {
    id: proposal.id,
    proposerAddress: proposal.proposerAddress,
    state: stateName(proposal.state),
    approvals: proposal.approvals.length,
    expirationTime: proposal.expirationTime,
    changes: proposalParameterChanges(proposal.parameters, parameters),
  };
}

async function findCreatedProposal(
  gateway: TronGateway,
  owner: string,
  changes: ChainParameterChange[],
): Promise<number | undefined> {
  const expected = new Map(changes.map((change) => [String(change.id), String(change.proposedValue)]));
  const matches = (await gateway.getProposals()).filter((proposal) =>
    proposal.proposerAddress === owner &&
    expected.size === Object.keys(proposal.parameters).length &&
    [...expected].every(([id, value]) => proposal.parameters[id] === value),
  );
  return matches.sort((left, right) => right.id - left.id)[0]?.id;
}
