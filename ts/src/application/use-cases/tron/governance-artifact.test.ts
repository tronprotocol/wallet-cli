import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { TronWitnessService } from "./witness-service.js";
import { TronProposalService } from "./proposal-service.js";
import { TronContractService } from "./contract-service.js";

const NET: NetworkDescriptor = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";
const CONTRACT = "TPgmqJ9ixVReY2Zc5FSYiC8qp4yZybbMhU";
const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

/**
 * Every governance WRITE must hand the pipeline an `artifact` hook.
 *
 * Without it `--build-only` fails outright ("this chain adapter cannot produce transaction hex") and
 * `--sign-only` silently omits `hex` — while both flags stay advertised in the command's help. All
 * nine writes shipped that way, because the flags are wired generically and nothing asserted the
 * hook was present. This test is per-command for that reason: the hook is passed at each call site.
 */
function harness(overrides: Partial<TronGateway> = {}) {
  const captured: TxPipelineParams[] = [];
  const gateway = {
    encodeTransactionHex: vi.fn(() => "0a02deadbeef"),
    getWitness: async () => ({ address: OWNER, voteCount: "1", url: "u" }),
    getAccount: async () => ({ address: OWNER, balance: "10000000000" }),
    getChainParameters: async () => [
      { key: "getAccountUpgradeCost", value: 9_999_000_000 },
      { key: "getMaintenanceTimeInterval", value: 1_800_000 },
    ],
    getProposals: async () => [
      {
        id: 7,
        proposerAddress: OWNER,
        parameters: { "0": "100000" },
        expirationTime: Date.now() + 600_000,
        createTime: Date.now(),
        approvals: [],
        state: "PENDING" as const,
      },
    ],
    getWitnesses: async () => [{ address: OWNER, voteCount: "1", url: "u" }],
    getContractMetadata: async () => ({
      name: "t",
      methods: [],
      originAddress: OWNER,
      contract: {},
      info: {},
    }),
    getProposal: async () => ({
      id: 7,
      proposerAddress: OWNER,
      parameters: { "0": "100000" },
      expirationTime: Date.now() + 600_000,
      createTime: Date.now(),
      approvals: [],
      state: "PENDING" as const,
    }),
    buildWitnessCreate: async () => ({}),
    buildWitnessUpdate: async () => ({}),
    buildWitnessSetBrokerage: async () => ({}),
    buildProposalCreate: async () => ({}),
    buildProposalApprove: async () => ({}),
    buildProposalDelete: async () => ({}),
    buildClearContractAbi: async () => ({}),
    buildUpdateOriginEnergyLimit: async () => ({}),
    buildUpdateUserResourcePercent: async () => ({}),
    ...overrides,
  } as unknown as TronGateway;

  const pipeline = {
    assertCanSign: vi.fn(),
    run: async (params: TxPipelineParams) => {
      captured.push(params);
      return { stage: "submitted", txId: "tx", feeSun: 0 } as never;
    },
  } as unknown as TxPipeline;

  const provider = { get: () => gateway } as unknown as ChainGatewayProvider;
  return {
    captured,
    witness: new TronWitnessService(provider, pipeline),
    proposal: new TronProposalService(provider, pipeline),
    contract: new TronContractService(provider, pipeline),
  };
}

describe("every governance write supplies the --build-only / --sign-only artifact hook", () => {
  const calls: Array<[string, (h: ReturnType<typeof harness>) => Promise<unknown>]> = [
    ["witness update", (h) => h.witness.update(scope, NET, { url: "https://sr.example" })],
    ["witness set-brokerage", (h) => h.witness.setBrokerage(scope, NET, { percent: 20 })],
    [
      "proposal create",
      (h) => h.proposal.create(scope, NET, { set: ["getMaintenanceTimeInterval=100000"] } as never),
    ],
    ["proposal approve", (h) => h.proposal.approve(scope, NET, { id: 7 } as never)],
    ["proposal delete", (h) => h.proposal.delete(scope, NET, { id: 7 } as never)],
    ["contract clear-abi", (h) => h.contract.clearAbi(scope, NET, { address: CONTRACT })],
    [
      "contract set-origin-energy-limit",
      (h) => h.contract.setOriginEnergyLimit(scope, NET, { address: CONTRACT, energy: "15000000" }),
    ],
    [
      "contract set-user-resource-percent",
      (h) => h.contract.setUserResourcePercent(scope, NET, { address: CONTRACT, percent: 60 }),
    ],
  ];

  it.each(calls)("`%s` passes artifact", async (_label, call) => {
    const h = harness();
    await call(h); // a guard rejecting here would mean the double is wrong, not the hook
    expect(h.captured).toHaveLength(1);
    const { artifact } = h.captured[0]!;
    expect(typeof artifact).toBe("function");
    expect(artifact!({} as never)).toBe("0a02deadbeef");
  });

  // `witness create` is the ninth write; it burns 9999 TRX so its own success path is not
  // exercised on chain, which makes the hook assertion here the only coverage it gets.
  it("`witness create` passes artifact too", async () => {
    // The ninth write. Its success path is never exercised on chain (it burns 9999 TRX), so this is
    // the only coverage the hook gets there. Needs a gateway that reports "not yet a witness".
    const h = harness({ getWitness: async () => null });
    await h.witness.create(scope, NET, { url: "https://sr.example" });
    expect(h.captured).toHaveLength(1);
    expect(typeof h.captured[0]!.artifact).toBe("function");
  });
});
