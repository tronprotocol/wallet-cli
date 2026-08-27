import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { SignerResolver } from "../../services/signer/index.js";
import { TxPipeline } from "../../services/pipeline/index.js";
import { TronWitnessService } from "./witness-service.js";
import { TronProposalService } from "./proposal-service.js";
import { TronContractService } from "./contract-service.js";

/**
 * The nine governance writes advertise `--permission-id` and `--expiration`. They once bound both
 * inside their own builders instead of through the pipeline's `prepare` hook, and the pipeline's
 * guard reads "no prepare hook ⇒ this adapter cannot apply these options" — so every non-default
 * value was rejected after the transaction had already been built, in every execution mode. The
 * multi-sig story for governance was simply unreachable.
 *
 * These tests drive the REAL `TxPipeline`. The other governance suites pass a fake pipeline that
 * records params, which is exactly why the guard never fired in test: only the real one has it.
 */
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
  activeAccount: "wlt_test.0" as never,
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

function harness(overrides: Partial<TronGateway> = {}) {
  const built = { raw_data: { timestamp: 1_000_000, expiration: 1_060_000, contract: [{}] } };
  // Mirrors the observable half of the real `prepareTransaction`: binds Permission_id and sets
  // expiration relative to the transaction's own timestamp. Clones, because the real one does
  // (`structuredClone`) and because `built` is shared across the cases below.
  const prepareTransaction = vi.fn(
    (tx: unknown, options: { permissionId: number; expiration?: number }) => {
      const prepared = structuredClone(tx) as typeof built & {
        raw_data: { contract: Array<{ Permission_id?: number }> };
      };
      if (options.permissionId !== 0)
        prepared.raw_data.contract[0]!.Permission_id = options.permissionId;
      if (options.expiration !== undefined)
        prepared.raw_data.expiration = prepared.raw_data.timestamp + options.expiration;
      return prepared;
    },
  );
  const gateway = {
    encodeTransactionHex: vi.fn(() => "0a02deadbeef"),
    prepareTransaction,
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
    getProposal: async () => ({
      id: 7,
      proposerAddress: OWNER,
      parameters: { "0": "100000" },
      expirationTime: Date.now() + 600_000,
      createTime: Date.now(),
      approvals: [],
      state: "PENDING" as const,
    }),
    getWitnesses: async () => [{ address: OWNER, voteCount: "1", url: "u" }],
    getContractMetadata: async () => ({
      name: "t",
      methods: [],
      originAddress: OWNER,
      contract: {},
      info: {},
    }),
    buildWitnessCreate: async () => built,
    buildWitnessUpdate: async () => built,
    buildWitnessSetBrokerage: async () => built,
    buildProposalCreate: async () => built,
    buildProposalApprove: async () => built,
    buildProposalDelete: async () => built,
    buildClearContractAbi: async () => built,
    buildUpdateOriginEnergyLimit: async () => built,
    buildUpdateUserResourcePercent: async () => built,
    ...overrides,
  } as unknown as TronGateway;

  const signer: Signer = {
    kind: "software",
    address: OWNER,
    sign: async (tx) => tx as never,
    signMessage: async () => "",
    signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
  };
  const signers = { assertCanSign: () => {}, resolve: () => signer } as unknown as SignerResolver;
  const pipeline = new TxPipeline(signers);
  const provider = { get: () => gateway } as unknown as ChainGatewayProvider;
  return {
    gateway,
    prepareTransaction,
    witness: new TronWitnessService(provider, pipeline),
    proposal: new TronProposalService(provider, pipeline),
    contract: new TronContractService(provider, pipeline),
  };
}

type Call = (h: ReturnType<typeof harness>, opts: Record<string, unknown>) => Promise<unknown>;

const WRITES: Array<[string, Call]> = [
  [
    "witness update",
    (h, o) => h.witness.update(scope, NET, { url: "https://sr.example", ...o } as never),
  ],
  [
    "witness set-brokerage",
    (h, o) => h.witness.setBrokerage(scope, NET, { percent: 20, ...o } as never),
  ],
  [
    "proposal create",
    (h, o) =>
      h.proposal.create(scope, NET, { set: ["getMaintenanceTimeInterval=100000"], ...o } as never),
  ],
  ["proposal approve", (h, o) => h.proposal.approve(scope, NET, { id: 7, ...o } as never)],
  ["proposal delete", (h, o) => h.proposal.delete(scope, NET, { id: 7, ...o } as never)],
  [
    "contract clear-abi",
    (h, o) => h.contract.clearAbi(scope, NET, { address: CONTRACT, ...o } as never),
  ],
  [
    "contract set-origin-energy-limit",
    (h, o) =>
      h.contract.setOriginEnergyLimit(scope, NET, {
        address: CONTRACT,
        energy: "15000000",
        ...o,
      } as never),
  ],
  [
    "contract set-user-resource-percent",
    (h, o) =>
      h.contract.setUserResourcePercent(scope, NET, {
        address: CONTRACT,
        percent: 60,
        ...o,
      } as never),
  ],
];

describe("governance writes accept --permission-id through the real pipeline", () => {
  it.each(WRITES)("`%s` builds with --permission-id 2", async (_label, call) => {
    const h = harness();
    const result = (await call(h, { permissionId: 2, buildOnly: true })) as { hex?: string };
    expect(result.hex).toBe("0a02deadbeef");
    expect(h.prepareTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ permissionId: 2 }),
    );
  });

  // The ninth write; it burns 9999 TRX so it needs a gateway that reports "not yet a witness".
  it("`witness create` builds with --permission-id 2", async () => {
    const h = harness({ getWitness: async () => null });
    const result = (await h.witness.create(scope, NET, {
      url: "https://sr.example",
      permissionId: 2,
      buildOnly: true,
    } as never)) as { hex?: string };
    expect(result.hex).toBe("0a02deadbeef");
  });
});

describe("governance writes accept --expiration through the real pipeline", () => {
  it.each(WRITES)("`%s` builds with --expiration 60000", async (_label, call) => {
    const h = harness();
    const result = (await call(h, { expiration: 60_000, buildOnly: true })) as { hex?: string };
    expect(result.hex).toBe("0a02deadbeef");
    expect(h.prepareTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expiration: 60_000 }),
    );
  });
});

/**
 * `--expiration` must mean the same thing on every command that offers it: the transaction expires
 * that many milliseconds after its own timestamp. `tx send`, `contract send` and `contract deploy`
 * all get that from the pipeline's `prepare` hook.
 *
 * The governance group instead extended the node's default window, so the same flag produced a
 * different window here (node default + N, i.e. ~60s more than asked) and the result depended on
 * whichever block timestamp the node happened to serve — the opposite of what an offline multi-sig
 * window needs. These tests pin the shared meaning; they run the real adapter so the transaction
 * bytes are the ones a node would receive.
 */
describe("--expiration means the same on governance as everywhere else", () => {
  // Anchored to the present: tronweb's extendExpiration refuses a window that has already passed,
  // which would fail these tests for a reason that has nothing to do with the semantics they pin.
  const NOW = Date.now();

  async function realGatewayHarness() {
    const { TronRpcClient } = await import("../../../adapters/outbound/chain/tron/tron.js");
    const rpc = new TronRpcClient("https://node.invalid", 1000);
    rpc.tronweb.trx.getCurrentRefBlockParams = (async () => ({
      ref_block_bytes: "4b6b",
      ref_block_hash: "4ad4875499feb0de",
      expiration: NOW + 60_000,
      timestamp: NOW,
    })) as never;

    // Real transaction construction/preparation, faked reads: the expiration maths is what is
    // under test, not the chain state the command happens to need.
    const gateway = {
      buildProposalCreate: rpc.buildProposalCreate.bind(rpc),
      prepareTransaction: rpc.prepareTransaction.bind(rpc),
      encodeTransactionHex: rpc.encodeTransactionHex.bind(rpc),
      getChainParameters: async () => [{ key: "getMaintenanceTimeInterval", value: 1_800_000 }],
      getWitnesses: async () => [{ address: OWNER, voteCount: "1", url: "u" }],
      getWitness: async () => ({ address: OWNER, voteCount: "1", url: "u" }),
    } as unknown as TronGateway;

    const signer: Signer = {
      kind: "software",
      address: OWNER,
      sign: async (tx) => tx as never,
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: () => {}, resolve: () => signer } as unknown as SignerResolver;
    const provider = { get: () => gateway } as unknown as ChainGatewayProvider;
    return new TronProposalService(provider, new TxPipeline(signers));
  }

  it.each([
    ["60 seconds", 60_000],
    ["24 hours", 86_400_000],
  ])(
    "`proposal create --expiration` expires that long after the transaction timestamp: %s",
    async (_l, ms) => {
      const service = await realGatewayHarness();
      const out = (await service.create(scope, NET, {
        set: ["getMaintenanceTimeInterval=100000"],
        expiration: ms,
        buildOnly: true,
      } as never)) as unknown as { tx: { raw_data: { timestamp: number; expiration: number } } };

      expect(out.tx.raw_data.expiration - out.tx.raw_data.timestamp).toBe(ms);
    },
  );
});
