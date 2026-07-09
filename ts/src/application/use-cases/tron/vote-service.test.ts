import { describe, expect, it } from "vitest";
import { TronVoteService } from "./vote-service.js";
import { TronStakeService } from "./stake-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";

const NET: NetworkDescriptor = { id: "tron:nile", family: "tron", chainId: "nile", aliases: [], capabilities: [] };
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const SR1 = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const SR2 = "TZ4UXDV5ZhNW7fb2AMSbgfAEZ7hWsnYS2g";

const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

function service(gateway: Partial<TronGateway>, pipeline?: Partial<TxPipeline>) {
  const g = gateway as TronGateway;
  const gateways = { get: () => g } as unknown as ChainGatewayProvider;
  const pipe = { run: async () => ({ stage: "submitted", txId: "txid" }), ...pipeline } as unknown as TxPipeline;
  // voting power now comes from the injected stake service (reads getAccountResources).
  return new TronVoteService(gateways, pipe, new TronStakeService(gateways, pipe));
}

describe("TronVoteService.cast", () => {
  it("rejects a full vote allocation above voting power", async () => {
    const svc = service({
      getAccountResources: async () => ({ tronPowerLimit: 100, tronPowerUsed: 0 } as never),
    });
    await expect(svc.cast(scope, NET, { for: [`${SR1}=101`] })).rejects.toMatchObject({
      code: "insufficient_voting_power",
    });
  });

  it("echoes parsed votes and total votes after pipeline submission", async () => {
    const svc = service({
      getAccountResources: async () => ({ tronPowerLimit: 1000, tronPowerUsed: 0 } as never),
      buildVoteWitness: async () => ({}),
    });
    await expect(svc.cast(scope, NET, { for: [`${SR1}=6`, `${SR2}=4`] })).resolves.toMatchObject({
      kind: "vote-cast",
      stage: "submitted",
      txId: "txid",
      totalVotes: 10,
      votes: [
        { witness: SR1, count: 6 },
        { witness: SR2, count: 4 },
      ],
    });
  });
});

describe("TronVoteService.list/status", () => {
  it("sorts witnesses by vote count and converts brokerage to reward ratio", async () => {
    const svc = service({
      getWitnesses: async () => [
        { address: SR1, voteCount: "100", url: "https://alpha.example" },
        { address: SR2, voteCount: "200", url: "https://beta.example" },
      ],
      getBrokerage: async (address) => address === SR2 ? 100 : 20,
    });
    await expect(svc.list(NET, { limit: 2 })).resolves.toEqual({
      witnesses: [
        { rank: 1, name: "beta.example", address: SR2, voteCount: "200", rewardRatioPct: 0, brokeragePct: 100, aprPct: null },
        { rank: 2, name: "alpha.example", address: SR1, voteCount: "100", rewardRatioPct: 80, brokeragePct: 20, aprPct: null },
      ],
    });
  });

  it("reports current voting power, reward, votes, and warns via scope.warn on a zero reward ratio", async () => {
    const warnings: string[] = [];
    const warnScope = { ...scope, warn: (m: string) => warnings.push(m) };
    const svc = service({
      getAccount: async () => ({ votes: [{ vote_address: SR2, vote_count: "400" }] }),
      getAccountResources: async () => ({ tronPowerLimit: 1500, tronPowerUsed: 400 } as never),
      getReward: async () => "12345678",
      getWitnesses: async () => [{ address: SR2, voteCount: "200", url: "https://beta.example" }],
      getBrokerage: async () => 100,
    });
    const result = await svc.status(warnScope, NET);
    expect(result).toMatchObject({
      address: OWNER,
      votingPower: { total: 1500, used: 400, available: 1100 },
      claimableRewardSun: "12345678",
      votes: [{ witness: SR2, name: "beta.example", count: 400, rewardRatioPct: 0, brokeragePct: 100, aprPct: null }],
    });
    // zero-ratio warning now goes through the standard warn channel, not a data key.
    expect(result).not.toHaveProperty("__walletCliWarnings");
    expect(warnings).toEqual([`400 votes on ${SR2} (beta.example) earn nothing: reward ratio is 0%`]);
  });
});
