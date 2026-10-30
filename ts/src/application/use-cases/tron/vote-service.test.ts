import { describe, expect, it } from "vitest";
import { TronVoteService } from "./vote-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { WalletError } from "../../../domain/errors/index.js";

const NET: NetworkDescriptor = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
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

function votingPower(total: number, used: number) {
  return {
    energy: { used: 0, limit: 0 },
    bandwidth: { used: 0, limit: 0 },
    votingPower: { total, used },
  };
}

function service(gateway: Partial<TronGateway>, pipeline?: Partial<TxPipeline>) {
  const g = gateway as TronGateway;
  const gateways = { get: () => g } as unknown as ChainGatewayProvider;
  const pipe = {
    assertCanSign: () => {},
    runTron: async () => ({ stage: "submitted", txId: "txid" }),
    ...pipeline,
  } as unknown as TxPipeline;
  return new TronVoteService(gateways, pipe);
}

describe("TronVoteService.cast", () => {
  it("refuses more vote entries than one transaction carries", async () => {
    const svc = service({ getAccountResources: async () => votingPower(100, 0) });
    const entries = Array.from({ length: 31 }, () => `${SR1}=1`);
    await expect(svc.cast(scope, NET, { for: entries })).rejects.toMatchObject({
      code: "invalid_value",
      message: "for accepts at most 30 entries",
    });
  });

  it("rejects a full vote allocation above voting power", async () => {
    const svc = service({
      getAccountResources: async () => votingPower(100, 0),
    });
    await expect(svc.cast(scope, NET, { for: [`${SR1}=101`] })).rejects.toMatchObject({
      code: "insufficient_voting_power",
    });
  });

  it("capability gate wins over the voting-power rule: watch-only fails before any RPC", async () => {
    const svc = service(
      {
        getAccountResources: async () => {
          throw new Error("voting power must not be read for a watch-only account");
        },
      },
      {
        assertCanSign: () => {
          throw new WalletError(
            "watch_only_no_signer",
            "watch-only account cannot sign; import its secret to sign",
          );
        },
      },
    );
    await expect(svc.cast(scope, NET, { for: [`${SR1}=1`] })).rejects.toMatchObject({
      code: "watch_only_no_signer",
    });
  });

  it("echoes parsed votes and total votes after pipeline submission", async () => {
    const svc = service({
      getAccountResources: async () => votingPower(1000, 0),
      buildVoteWitness: async () => ({}) as never,
    });
    await expect(svc.cast(scope, NET, { for: [`${SR1}=6`, `${SR2}=4`] })).resolves.toMatchObject({
      kind: "vote-cast",
      stage: "submitted",
      txId: "txid",
      totalVotes: 10,
      maintenanceIntervalMs: 6 * 60 * 60 * 1000,
      votes: [
        { witness: SR1, count: 6 },
        { witness: SR2, count: 4 },
      ],
    });
  });
});

describe("TronVoteService.list/status", () => {
  it("fails on a malformed vote count instead of ranking the witness last", async () => {
    const svc = service({
      getWitnesses: async () => [
        { address: SR1, voteCount: "100" },
        { address: SR2, voteCount: "1e3" },
      ],
      getBrokerage: async () => 20,
    });
    await expect(svc.list(NET, { limit: 2 })).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  it("ranks vote counts beyond the safe-integer range exactly", async () => {
    const svc = service({
      getWitnesses: async () => [
        { address: SR1, voteCount: "9007199254740992" },
        { address: SR2, voteCount: "9007199254740993" },
      ],
      getBrokerage: async () => 20,
    });
    const { witnesses } = await svc.list(NET, { limit: 2 });
    expect(witnesses.map((witness) => witness.address)).toEqual([SR2, SR1]);
  });

  it("sorts witnesses by vote count and converts brokerage to reward ratio", async () => {
    const svc = service({
      getWitnesses: async () => [
        { address: SR1, voteCount: "100", url: "https://alpha.example" },
        { address: SR2, voteCount: "200", url: "https://beta.example" },
      ],
      getBrokerage: async (address) => (address === SR2 ? 100 : 20),
    });
    await expect(svc.list(NET, { limit: 2 })).resolves.toEqual({
      witnesses: [
        {
          rank: 1,
          name: "beta.example",
          address: SR2,
          voteCount: "200",
          rewardRatioPct: 0,
          brokeragePct: 100,
          aprPct: null,
        },
        {
          rank: 2,
          name: "alpha.example",
          address: SR1,
          voteCount: "100",
          rewardRatioPct: 80,
          brokeragePct: 20,
          aprPct: null,
        },
      ],
    });
  });

  it("reports current voting power, reward, votes, and warns via scope.warn on a zero reward ratio", async () => {
    const warnings: string[] = [];
    const warnScope = { ...scope, warn: (m: string) => warnings.push(m) };
    const svc = service({
      getAccountState: async () => ({ votes: [{ witness: SR2, count: "400" }] }) as never,
      getAccountResources: async () => votingPower(1500, 400),
      getReward: async () => "12345678",
      getWitnesses: async () => [{ address: SR2, voteCount: "200", url: "https://beta.example" }],
      getBrokerage: async () => 100,
    });
    const result = await svc.status(warnScope, NET);
    expect(result).toMatchObject({
      address: OWNER,
      votingPower: { total: 1500, used: 400, available: 1100 },
      claimableRewardSun: "12345678",
      votes: [
        {
          witness: SR2,
          name: "beta.example",
          count: 400,
          rewardRatioPct: 0,
          brokeragePct: 100,
          aprPct: null,
        },
      ],
    });
    expect(result).not.toHaveProperty("__walletCliWarnings");
    expect(warnings).toEqual([
      `400 votes on ${SR2} (beta.example) earn nothing: reward ratio is 0%`,
    ]);
  });
});
