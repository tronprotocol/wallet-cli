import { requestDispatchCheck, unlessDeadline } from "../../services/command-deadline.js";
import { systemWallClock, type WallClock } from "../../contracts/wall-clock.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError, errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import { decimalToBigInt } from "../../../domain/numbers/index.js";
import {
  ELECTED_SR_COUNT,
  MAX_REWARDED_RANK,
  MAX_VOTE_ITEMS,
} from "../../../domain/tron/governance/voting.js";
import { addressCodec } from "../../../domain/family/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway, TronVote, TronWitness } from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { readVotingPower } from "./voting-power.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

const BROKERAGE_CONCURRENCY = 8;

// Runs after the vote may have been sent, so any failure, deadline expiry included, omits the value.
async function readMaintenanceIntervalMs(gateway: TronGateway): Promise<number | undefined> {
  try {
    const parameters = await gateway.getChainParameters();
    const value = parameters.find((entry) => entry.key === "getMaintenanceTimeInterval")?.value;
    return value !== undefined && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export interface VoteCastInput extends TransactionModeInput {
  for: string[];
}

export interface VoteListInput {
  limit: number;
  candidates?: boolean;
}

interface VoteReadScope {
  readonly activeAccount: TransactionScope["activeAccount"];
  readonly deadline: TransactionScope["deadline"];
  resolveAddress(family: "tron"): string;
  warn(message: string): void;
}

// Share in-flight brokerage reads within one request.
type BrokerageCache = Map<string, Promise<number | null>>;

interface WitnessView {
  rank: number;
  name: string;
  address: string;
  voteCount: string;
  rewardRatioPct: number | null;
  brokeragePct: number | null;
  aprPct: number | null;
}

interface CurrentVoteView {
  witness: string;
  name: string;
  count: number;
  rewardRatioPct: number | null;
  brokeragePct: number | null;
  aprPct: number | null;
}

export class TronVoteService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
    private readonly now: WallClock = systemWallClock,
  ) {}

  async cast(scope: TransactionScope, network: NetworkDescriptor, input: VoteCastInput) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const votes = parseVoteInputs(input.for);
    const totalVotes = votes.reduce((sum, vote) => sum + BigInt(vote.count), 0n);
    if (totalVotes > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError(
        "invalid_value",
        "total votes exceed the safe-integer limit for this client",
      );
    }
    const owner = scope.resolveAddress("tron");
    const votingPower = await readVotingPower(gateway, owner);
    if (totalVotes > BigInt(votingPower.total)) {
      throw new UsageError(
        "insufficient_voting_power",
        `total votes ${totalVotes.toString()} exceed voting power ${votingPower.total} TP`,
      );
    }
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway, this.now),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (ownerAddress) => gateway.buildVoteWitness(ownerAddress, votes),
      estimate: async (_tx: UnsignedTx) => ({
        feeModel: "tron-resource",
        note: "voting uses bandwidth only",
      }),
    });
    const maintenanceIntervalMs = await readMaintenanceIntervalMs(gateway);
    return {
      kind: "vote-cast" as const,
      ...outcomeData(outcome),
      votes: votes.map((vote) => ({ witness: vote.witness, count: Number(vote.count) })),
      totalVotes: Number(totalVotes),
      ...(maintenanceIntervalMs === undefined ? {} : { maintenanceIntervalMs }),
    };
  }

  async list(deadline: ExecutionDeadline, network: NetworkDescriptor, input: VoteListInput) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    const limit = Math.min(input.limit, input.candidates ? MAX_REWARDED_RANK : ELECTED_SR_COUNT);
    const witnesses = byVotesDescending(await gateway.getWitnesses(limit)).slice(0, limit);
    const cache: BrokerageCache = new Map();
    return {
      witnesses: await mapWithLimit(witnesses, BROKERAGE_CONCURRENCY, (witness, index) =>
        this.witnessView(deadline, gateway, witness, index + 1, cache),
      ),
    };
  }

  async status(scope: VoteReadScope, network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const address = scope.resolveAddress("tron");
    const [account, claimableRewardSun, witnesses, votingPower] = await Promise.all([
      gateway.getAccountState(address),
      gateway.getReward(address),
      gateway
        .getWitnesses(MAX_REWARDED_RANK)
        .catch(unlessDeadline(scope.deadline, (): TronWitness[] => [])),
      readVotingPower(gateway, address),
    ]);
    const witnessMap = new Map(
      witnesses.map((witness, index) => [witness.address, { witness, rank: index + 1 }]),
    );
    const cache: BrokerageCache = new Map();
    const votes = await mapWithLimit(
      account.votes,
      BROKERAGE_CONCURRENCY,
      async (vote): Promise<CurrentVoteView> => {
        const known = witnessMap.get(vote.witness);
        const brokeragePct = await brokerageOf(scope.deadline, gateway, vote.witness, cache);
        return {
          witness: vote.witness,
          name: known ? witnessName(known.witness) : vote.witness,
          count: Number(vote.count),
          brokeragePct,
          rewardRatioPct: rewardRatioOf(brokeragePct),
          aprPct: null,
        };
      },
    );
    for (const vote of votes) {
      if (vote.rewardRatioPct === 0) scope.warn(zeroRatioWarning(vote));
    }
    return {
      address,
      votingPower,
      claimableRewardSun,
      votes,
    };
  }

  private async witnessView(
    deadline: ExecutionDeadline,
    gateway: TronGateway,
    witness: TronWitness,
    rank: number,
    cache: BrokerageCache,
  ): Promise<WitnessView> {
    const brokeragePct = await brokerageOf(deadline, gateway, witness.address, cache);
    return {
      rank,
      name: witnessName(witness),
      address: witness.address,
      voteCount: witness.voteCount,
      rewardRatioPct: rewardRatioOf(brokeragePct),
      brokeragePct,
      aprPct: null,
    };
  }
}

function parseVoteInputs(values: string[]): TronVote[] {
  if (values.length === 0)
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("for")} must include at least one SR=votes entry`,
    );
  if (values.length > MAX_VOTE_ITEMS)
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("for")} accepts at most ${MAX_VOTE_ITEMS} entries`,
    );
  const codec = addressCodec("tron");
  const seen = new Set<string>();
  return values.map((entry) => {
    const separator = entry.lastIndexOf("=");
    if (separator <= 0 || separator === entry.length - 1) {
      throw new UsageError(
        "invalid_value",
        errorMessage`invalid ${inputRef("for")} entry '${entry}'; expected SR=votes`,
      );
    }
    const witness = entry.slice(0, separator).trim();
    const count = entry.slice(separator + 1).trim();
    if (!codec.validate(witness))
      throw new UsageError("invalid_value", `invalid witness address: ${witness}`);
    if (seen.has(witness))
      throw new UsageError("invalid_value", `duplicate witness address: ${witness}`);
    seen.add(witness);
    if (!/^\d+$/.test(count) || /^0+$/.test(count)) {
      throw new UsageError("invalid_value", `vote count for ${witness} must be a positive integer`);
    }
    if (BigInt(count) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError(
        "invalid_value",
        `vote count for ${witness} exceeds the safe-integer limit for this client`,
      );
    }
    return { witness, count };
  });
}

function zeroRatioWarning(vote: CurrentVoteView): string {
  return `${vote.count} votes on ${vote.witness} (${vote.name}) earn nothing: reward ratio is 0%`;
}

function brokerageOf(
  deadline: ExecutionDeadline,
  gateway: TronGateway,
  address: string,
  cache: BrokerageCache,
): Promise<number | null> {
  let pending = cache.get(address);
  if (!pending) {
    pending = gateway.getBrokerage(address).catch(unlessDeadline(deadline, () => null));
    cache.set(address, pending);
  }
  return pending;
}

// Bound RPC fan-out while preserving input order.
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function rewardRatioOf(brokeragePct: number | null): number | null {
  if (brokeragePct === null || !Number.isFinite(brokeragePct)) return null;
  return Math.max(0, Math.min(100, 100 - brokeragePct));
}

function witnessName(witness: TronWitness): string {
  const url = witness.url?.trim();
  if (!url) return witness.address;
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "") || witness.address;
  }
}

// A malformed vote count fails rather than ranking the witness last.
function byVotesDescending(witnesses: TronWitness[]): TronWitness[] {
  const invalid = (message: string) => new ChainError("invalid_node_response", message);
  return witnesses
    .map((witness) => ({
      witness,
      votes: decimalToBigInt(
        witness.voteCount,
        `vote count of witness ${witness.address}`,
        invalid,
      ),
    }))
    .sort((a, b) => (a.votes === b.votes ? 0 : a.votes < b.votes ? 1 : -1))
    .map(({ witness }) => witness);
}
