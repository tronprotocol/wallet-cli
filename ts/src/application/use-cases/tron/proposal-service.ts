import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import {
  parseChainParameterAssignments,
  proposalParameters,
  type ChainParameterChange,
} from "../../../domain/governance/chain-parameters.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronProposal } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";
import {
  governanceTransactionMode,
  transactionResource,
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

export class TronProposalService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  async list(network: NetworkDescriptor, input: ProposalListInput) {
    const gateway = this.gateways.get(network, "tron");
    const [proposals, witnesses] = await Promise.all([
      gateway.getProposals(),
      gateway.getWitnesses(27),
    ]);
    const approvalThreshold = threshold(witnesses.length);
    const views = proposals
      .filter((proposal) => input.state === "all" || isActive(proposal))
      .sort((left, right) => right.id - left.id)
      .map((proposal) => listView(proposal));
    const total = views.length;
    const proposalsPage = views.slice(
      input.offset,
      input.limit === undefined ? undefined : input.offset + input.limit,
    );
    return {
      approvalThreshold,
      proposals: proposalsPage,
      pagination: { offset: input.offset, limit: input.limit ?? null, total },
    };
  }

  async show(network: NetworkDescriptor, id: number) {
    const gateway = this.gateways.get(network, "tron");
    const [proposal, witnesses] = await Promise.all([
      gateway.getProposal(id),
      gateway.getWitnesses(27),
    ]);
    if (!proposal) throw new ChainError("proposal_not_found", `proposal #${id} was not found`);
    const approvalThreshold = threshold(witnesses.length);
    return {
      ...listView(proposal),
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
    // Taken BEFORE submitting, and only when a confirmation is actually going to be awaited: it is
    // the only way to tell a proposal that just appeared from one that was already there. A failure
    // to read it must not block the write, so it degrades to "no snapshot" and the id is omitted.
    const wantsId = scope.wait && mode.mode === "broadcast";
    const [parameters, , before] = await Promise.all([
      gateway.getChainParameters(),
      assertWitness(gateway, owner),
      wantsId ? proposalIdSnapshot(gateway).catch(() => undefined) : Promise.resolve(undefined),
    ]);
    const changes = parseChainParameterAssignments(input.set, parameters);
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      build: async (address) =>
        gateway.buildProposalCreate(
          address,
          changes.map((change) => ({ key: change.id, value: change.proposedValue })),
          { permissionId: input.permissionId },
        ),
      estimate: async (_tx: UnsignedTx) => ({
        feeModel: "tron-resource",
        note: "proposal creation uses bandwidth only",
      }),
    });
    const data = outcomeData(outcome);
    const proposalId =
      outcome.stage === "confirmed" && before !== undefined
        ? await findCreatedProposal(gateway, owner, changes, before, scope).catch(() => undefined)
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
      ...tronTransactionHooks(gateway),
      build: async (address) =>
        gateway.buildProposalApprove(address, input.id, addApproval, {
          permissionId: input.permissionId,
        }),
      estimate: async (_tx: UnsignedTx) => ({
        feeModel: "tron-resource",
        note: "proposal approval uses bandwidth only",
      }),
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
      throw new ChainError(
        "not_proposal_owner",
        `only ${proposal.proposerAddress} can delete proposal #${input.id}`,
      );
    }
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      build: async (address) =>
        gateway.buildProposalDelete(address, input.id, { permissionId: input.permissionId }),
      estimate: async (_tx: UnsignedTx) => ({
        feeModel: "tron-resource",
        note: "proposal deletion uses bandwidth only",
      }),
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
  if (!(await gateway.getWitness(address))) {
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
    throw new ChainError(
      "proposal_expired",
      `proposal #${proposal.id} is no longer in its voting window`,
    );
  }
}

function isActive(proposal: TronProposal): boolean {
  return proposal.state === "PENDING" && proposal.expirationTime > Date.now();
}

function threshold(activeWitnessCount: number): number {
  return activeWitnessCount > 0 ? Math.max(1, Math.floor(activeWitnessCount * 0.7)) : 18;
}

function stateName(
  state: TronProposal["state"],
): "voting" | "approved" | "disapproved" | "canceled" {
  return (
    {
      PENDING: "voting",
      APPROVED: "approved",
      DISAPPROVED: "disapproved",
      CANCELED: "canceled",
    } as const
  )[state];
}

function listView(proposal: TronProposal) {
  return {
    id: proposal.id,
    proposerAddress: proposal.proposerAddress,
    state: stateName(proposal.state),
    approvals: proposal.approvals.length,
    expirationTime: proposal.expirationTime,
    parameters: proposalParameters(proposal.parameters),
  };
}

async function proposalIdSnapshot(gateway: TronGateway): Promise<Set<number>> {
  return new Set((await gateway.getProposals()).map((proposal) => proposal.id));
}

/**
 * The id of the proposal this call created, or nothing.
 *
 * The chain does not report it, so it has to be recognised in the list afterwards — and proposer
 * plus parameter set does not identify it: on mainnet 10 of 106 proposals share both with another,
 * because a rejected proposal gets re-submitted unchanged. `before` is what makes the difference
 * decidable; without it the best available answer was "the highest id that matches", which is the
 * OLD proposal whenever the list has not caught up with the confirmation yet.
 *
 * Anything other than exactly one new match is reported as unknown. A guessed id is worse than no
 * id: it is handed straight to `proposal approve` and the irreversible `proposal delete`.
 */
async function findCreatedProposal(
  gateway: TronGateway,
  owner: string,
  changes: ChainParameterChange[],
  before: Set<number>,
  scope: TransactionScope,
): Promise<number | undefined> {
  const expected = new Map(
    changes.map((change) => [String(change.id), String(change.proposedValue)]),
  );
  const matches = (await gateway.getProposals()).filter(
    (proposal) =>
      !before.has(proposal.id) &&
      proposal.proposerAddress === owner &&
      expected.size === Object.keys(proposal.parameters).length &&
      [...expected].every(([id, value]) => proposal.parameters[id] === value),
  );
  if (matches.length === 1) return matches[0]!.id;
  scope.warn(
    matches.length === 0
      ? "could not identify the created proposal yet: the node's proposal list has not caught up with the confirmation. " +
          "Find it with `proposal list` — the transaction itself succeeded"
      : `could not identify the created proposal: ${matches.length} new proposals match these parameters. ` +
          "Find it with `proposal list` before approving or deleting anything",
  );
  return undefined;
}
