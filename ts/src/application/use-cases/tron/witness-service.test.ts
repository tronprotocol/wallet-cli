import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { TronWitnessService } from "./witness-service.js";

const NET: NetworkDescriptor = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

function createService(gateway: Partial<TronGateway>) {
  const concrete = gateway as TronGateway;
  const assertCanSign = vi.fn();
  const pipeline = {
    assertCanSign,
    run: async (params: TxPipelineParams) => {
      await params.build(OWNER);
      return { stage: "submitted", txId: "tx-witness", feeSun: 0 } as never;
    },
  } as unknown as TxPipeline;
  const service = new TronWitnessService(
    { get: () => concrete } as unknown as ChainGatewayProvider,
    pipeline,
  );
  return Object.assign(service, { assertCanSign }) as TronWitnessService & {
    assertCanSign: typeof assertCanSign;
  };
}

describe("TronWitnessService", () => {
  it("uses getAccountUpgradeCost exactly and reports the irreversible burn as feeSun", async () => {
    const build = vi.fn(async () => ({}));
    const service = createService({
      getWitness: async () => null,
      getAccount: async () => ({ address: OWNER, balance: "10000000000" }),
      getChainParameters: async () => [{ key: "getAccountUpgradeCost", value: 9_999_000_000 }],
      buildWitnessCreate: build,
    });
    await expect(
      service.create(scope, NET, {
        url: "https://sr.example",
        permissionId: 2,
      }),
    ).resolves.toMatchObject({
      kind: "witness-create",
      feeSun: "9999000000",
      registrationFeeSun: "9999000000",
    });
    expect(build).toHaveBeenCalledWith(OWNER, "https://sr.example", { permissionId: 2 });
  });

  it("rejects insufficient registration balance before building", async () => {
    const build = vi.fn();
    const service = createService({
      getWitness: async () => null,
      getAccount: async () => ({ address: OWNER, balance: "9998999999" }),
      getChainParameters: async () => [{ key: "getAccountUpgradeCost", value: 9_999_000_000 }],
      buildWitnessCreate: build,
    });
    await expect(
      service.create(scope, NET, { url: "https://sr.example", permissionId: 0 }),
    ).rejects.toMatchObject({ code: "insufficient_balance" });
    expect(build).not.toHaveBeenCalled();
  });

  it("passes brokerage through unchanged: percent is the SR-retained share", async () => {
    const build = vi.fn(async () => ({}));
    const service = createService({
      getWitness: async () => ({ address: OWNER, voteCount: "1" }),
      buildWitnessSetBrokerage: build,
    });
    await expect(
      service.setBrokerage(scope, NET, { percent: 20, permissionId: 0 }),
    ).resolves.toMatchObject({ brokerage: 20 });
    expect(build).toHaveBeenCalledWith(OWNER, 20, { permissionId: 0 });
  });

  it("refuses an unactivated account before demanding the registration fee", async () => {
    const build = vi.fn(async () => ({}));
    const service = createService({
      getWitness: async () => null,
      getAccount: async () => ({}),
      getChainParameters: async () => [{ key: "getAccountUpgradeCost", value: 9_999_000_000 }],
      buildWitnessCreate: build,
    });
    await expect(service.create(scope, NET, { url: "https://sr.example" })).rejects.toMatchObject({
      code: "account_not_active",
    });
    expect(build).not.toHaveBeenCalled();
  });

  // The Ledger TRON app has no parser for WitnessCreate / WitnessUpdate / UpdateBrokerage
  // (java's ledger/wrapper/ContractTypeChecker lists neither), so every write in this group must be
  // refused as software-only BEFORE the device is touched — docs/adr/0003. Asserted per command
  // because the flag is passed at each call site and is easy to drop in one of them.
  describe("Ledger accounts", () => {
    const cases = [
      [
        "create",
        (s: ReturnType<typeof createService>) =>
          s.create(scope, NET, { url: "https://sr.example" }),
      ],
      [
        "update",
        (s: ReturnType<typeof createService>) =>
          s.update(scope, NET, { url: "https://sr.example" }),
      ],
      [
        "set-brokerage",
        (s: ReturnType<typeof createService>) => s.setBrokerage(scope, NET, { percent: 20 }),
      ],
    ] as const;

    it.each(cases)("`witness %s` demands a software signer", async (_label, call) => {
      const service = createService({
        getWitness: async () => ({ address: OWNER, voteCount: "0", url: "u" }) as never,
        getAccount: async () => ({ address: OWNER, balance: "10000000000" }),
        getChainParameters: async () => [{ key: "getAccountUpgradeCost", value: 9_999_000_000 }],
        buildWitnessCreate: async () => ({}) as never,
        buildWitnessUpdate: async () => ({}) as never,
        buildWitnessSetBrokerage: async () => ({}) as never,
      });
      await call(service).catch(() => undefined); // `create` rejects with already_witness; irrelevant here
      expect(service.assertCanSign).toHaveBeenCalledWith(scope.activeAccount, "tron", {
        requireSoftware: true,
      });
    });
  });
});
