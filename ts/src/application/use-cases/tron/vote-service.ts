import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import { addressCodec } from "../../../domain/family/index.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type {
  TronAccount,
  TronGateway,
  TronVote,
  TronVoteAllocation,
  TronWitness,
} from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData, transactionMode, type TransactionModeInput } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { TronStakeService } from "./stake-service.js";

const MAX_VOTE_ITEMS = 30;
const MAX_REWARDED_RANK = 127;
const ELECTED_SR_COUNT = 27;
/** cap on concurrent getBrokerage RPCs so `vote list --limit 127` doesn't open 127 sockets at once. */
const BROKERAGE_CONCURRENCY = 8;

export interface VoteCastInput extends TransactionModeInput {
  for: string[];
}

export interface VoteListInput {
  limit: number;
  candidates?: boolean;
}

interface VoteReadScope {
  readonly activeAccount: TransactionScope["activeAccount"];
  resolveAddress(family: "tron"): string;
  /** surface a non-fatal warning (→ meta.warnings + stderr), same channel as --wait warnings. */
  warn(message: string): void;
}

/** per-request brokerage cache: dedupes repeat addresses (a current vote's SR also in the list). */
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
    /** voting power (TP) is read authoritatively from the node via the stake service —
     *  the same source `stake info` uses — rather than recomputed from raw account balances. */
    private readonly stake: TronStakeService,
  ) {}

  async cast(scope: TransactionScope, network: NetworkDescriptor, input: VoteCastInput) {
    const gateway = this.gateways.get(network, "tron");
    const votes = parseVoteInputs(input.for);
    const totalVotes = votes.reduce((sum, vote) => sum + BigInt(vote.count), 0n);
    if (totalVotes > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError("invalid_value", "total votes exceed the safe-integer limit for this client");
    }
    const owner = scope.resolveAddress("tron");
    const votingPower = await this.stake.votingPower(network, owner);
    if (totalVotes > BigInt(votingPower.total)) {
      throw new UsageError(
        "insufficient_voting_power",
        `total votes ${totalVotes.toString()} exceed voting power ${votingPower.total} TP`,
      );
    }
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      confirm: tronConfirmation(gateway, scope),
      build: (ownerAddress) => gateway.buildVoteWitness(ownerAddress, votes),
      estimate: async (_tx: UnsignedTx) => ({ feeModel: "tron-resource", note: "voting uses bandwidth only" }),
    });
    return {
      kind: "vote-cast" as const,
      ...outcomeData(outcome),
      votes: votes.map((vote) => ({ witness: vote.witness, count: Number(vote.count) })),
      totalVotes: Number(totalVotes),
    };
  }

  async list(network: NetworkDescriptor, input: VoteListInput) {
    const gateway = this.gateways.get(network, "tron");
    const limit = Math.min(input.limit, input.candidates ? MAX_REWARDED_RANK : ELECTED_SR_COUNT);
    const witnesses = (await gateway.getWitnesses(limit))
      .sort((a, b) => compareUnsigned(b.voteCount, a.voteCount))
      .slice(0, limit);
    const cache: BrokerageCache = new Map();
    return {
      witnesses: await mapWithLimit(witnesses, BROKERAGE_CONCURRENCY, (witness, index) =>
        this.witnessView(gateway, witness, index + 1, cache),
      ),
    };
  }

  async status(scope: VoteReadScope, network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "tron");
    const address = scope.resolveAddress("tron");
    const [account, claimableRewardSun, witnesses, votingPower] = await Promise.all([
      gateway.getAccount(address),
      gateway.getReward(address),
      gateway.getWitnesses(MAX_REWARDED_RANK).catch((): TronWitness[] => []),
      this.stake.votingPower(network, address),
    ]);
    const witnessMap = new Map(witnesses.map((witness, index) => [witness.address, { witness, rank: index + 1 }]));
    const currentVotes = normalizeAccountVotes(account);
    const cache: BrokerageCache = new Map();
    const votes = await mapWithLimit(currentVotes, BROKERAGE_CONCURRENCY, async (vote): Promise<CurrentVoteView> => {
      const known = witnessMap.get(vote.witness);
      const brokeragePct = await brokerageOf(gateway, vote.witness, cache);
      return {
        witness: vote.witness,
        name: known ? witnessName(known.witness) : vote.witness,
        count: Number(vote.count),
        brokeragePct,
        rewardRatioPct: rewardRatioOf(brokeragePct),
        aprPct: null,
      };
    });
    // zero-reward-ratio votes earn nothing: warn via the standard channel (→ meta.warnings + stderr).
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

  private async witnessView(gateway: TronGateway, witness: TronWitness, rank: number, cache: BrokerageCache): Promise<WitnessView> {
    const brokeragePct = await brokerageOf(gateway, witness.address, cache);
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
  if (values.length === 0) throw new UsageError("invalid_value", "--for must include at least one SR=votes entry");
  if (values.length > MAX_VOTE_ITEMS) throw new UsageError("invalid_value", "--for accepts at most 30 entries");
  const codec = addressCodec("tron");
  const seen = new Set<string>();
  return values.map((entry) => {
    const separator = entry.lastIndexOf("=");
    if (separator <= 0 || separator === entry.length - 1) {
      throw new UsageError("invalid_value", `invalid --for entry '${entry}'; expected SR=votes`);
    }
    const witness = entry.slice(0, separator).trim();
    const count = entry.slice(separator + 1).trim();
    if (!codec.validate(witness)) throw new UsageError("invalid_value", `invalid witness address: ${witness}`);
    if (seen.has(witness)) throw new UsageError("invalid_value", `duplicate witness address: ${witness}`);
    seen.add(witness);
    if (!/^\d+$/.test(count) || /^0+$/.test(count)) {
      throw new UsageError("invalid_value", `vote count for ${witness} must be a positive integer`);
    }
    if (BigInt(count) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError("invalid_value", `vote count for ${witness} exceeds the safe-integer limit for this client`);
    }
    return { witness, count };
  });
}

function normalizeAccountVotes(account: TronAccount): TronVote[] {
  return (account.votes ?? [])
    .map(normalizeAccountVote)
    .filter((vote): vote is TronVote => vote !== null);
}

function normalizeAccountVote(vote: TronVoteAllocation): TronVote | null {
  const witness = tronHexToBase58(vote.vote_address ?? vote.voteAddress);
  const count = quantityString(vote.vote_count ?? vote.voteCount);
  if (!witness || count === "0") return null;
  return { witness, count };
}

function zeroRatioWarning(vote: CurrentVoteView): string {
  return `${vote.count} votes on ${vote.witness} (${vote.name}) earn nothing: reward ratio is 0%`;
}

/** getBrokerage with a per-request cache — a given SR is fetched at most once, and failures
 *  degrade to null (unknown reward ratio). */
function brokerageOf(gateway: TronGateway, address: string, cache: BrokerageCache): Promise<number | null> {
  let pending = cache.get(address);
  if (!pending) {
    pending = gateway.getBrokerage(address).catch(() => null);
    cache.set(address, pending);
  }
  return pending;
}

/** map with bounded concurrency (results keep input order), so a large witness list doesn't
 *  fan out one socket per item. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
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

function compareUnsigned(a: unknown, b: unknown): number {
  const left = quantity(a);
  const right = quantity(b);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function quantityString(value: unknown): string {
  const amount = quantity(value);
  return amount.toString();
}

function quantity(value: unknown): bigint {
  if (typeof value === "bigint") return value >= 0n ? value : 0n;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : 0n;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}
