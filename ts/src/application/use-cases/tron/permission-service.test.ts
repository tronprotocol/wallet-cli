import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountPermissionsView, Signer } from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { AccountStore } from "../../ports/account-store.js";
import { TxPipeline, type TronTxPipelineParams } from "../../services/pipeline/index.js";
import type { SignerResolver } from "../../services/signer/index.js";
import { SigningService } from "../../services/signing/signing-service.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { TronPermissionService } from "./permission-service.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const NO_DEADLINE = new CommandDeadline(0);

const A = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const NETWORK = { id: "tron:3448148188", family: "tron", nativeSymbol: "TRX" } as never;

function permissions(): AccountPermissionsView {
  return {
    address: A,
    owner: {
      id: 0,
      name: "owner",
      threshold: 2,
      keys: [
        { address: A, weight: 1, local: null },
        { address: B, weight: 1, local: null },
      ],
    },
    witness: null,
    actives: [
      {
        id: 2,
        name: "finance",
        threshold: 1,
        keys: [{ address: A, weight: 1, local: null }],
        operations: ["TransferContract"],
        operationLabels: ["Transfer TRX"],
        operationsHex: "02" + "00".repeat(31),
        unknownOperationIds: [],
      },
    ],
  };
}

function scope(): TransactionScope {
  return {
    activeAccount: "local" as never,
    deadline: new CommandDeadline(0),
    wait: false,

    resolveAddress: () => A,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function accounts(): AccountStore {
  return {
    list: () => [
      {
        accountId: "local" as never,
        label: "main",
        type: "privateKey",
        index: null,
        active: true,
        addresses: { tron: A },
      },
    ],
  } as unknown as AccountStore;
}

function setup(
  balance = "200000000",
  options: {
    outcome?: Record<string, unknown>;
    showPermissions?: () => Promise<AccountPermissionsView>;
  } = {},
) {
  const gateway = {
    getAccountPermissions: vi.fn(options.showPermissions ?? (async () => permissions())),
    getUpdateAccountPermissionFee: vi.fn(async () => 100_000_000),
    getNativeBalance: vi.fn(async () => balance),
    buildAccountPermissionUpdate: vi.fn(async () => ({ txID: "tx" })),
    prepareTransaction: vi.fn((tx) => tx),
    encodeTransactionHex: vi.fn(() => "abcd"),
  } as unknown as TronGateway;
  let captured: TronTxPipelineParams | undefined;
  const pipeline = {
    assertCanSign: vi.fn(),
    runTron: vi.fn(async (params: TronTxPipelineParams) => {
      captured = params;
      const tx = await params.build(A);
      if (options.outcome) return options.outcome;
      return { stage: "plan" as const, tx, fee: await params.estimate(tx) };
    }),
  } as unknown as TxPipeline;
  const provider = { get: () => gateway } as unknown as ChainGatewayProvider;
  return {
    gateway,
    pipeline,
    service: new TronPermissionService(provider, accounts(), pipeline),
    captured: () => captured,
  };
}

describe("TRON permission service", () => {
  it("annotates locally controlled keys on show", async () => {
    const { service } = setup();
    const view = await service.show(NO_DEADLINE, NETWORK, A);
    expect(view.owner.keys.map((key) => key.local)).toEqual(["main", null]);
  });

  it("dry-runs with dynamic fee, emits structured warnings, and never gates a signer", async () => {
    const { service, pipeline, captured } = setup();
    const ctx = scope();
    const result = await service.update(ctx, NETWORK, { dryRun: true }, permissions());
    expect(result).toMatchObject({ kind: "permission-update", mode: "dry-run" });
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "owner_lockout_partial" }),
    );
    expect(pipeline.assertCanSign).not.toHaveBeenCalled();
    expect(captured()?.permissionId).toBe(0);
    expect((result as unknown as { fee: unknown }).fee).toMatchObject({
      feeSun: "100000000",
      balanceSun: "200000000",
    });
  });

  it("hands the builder the full bitmap, unnamed bits included, and warns about them", async () => {
    const { service, gateway } = setup();
    const requested = permissions();
    requested.actives[0]!.operationsHex = "82" + "00".repeat(31);
    requested.actives[0]!.unknownOperationIds = [7];
    const ctx = scope();
    await service.update(ctx, NETWORK, { dryRun: true }, requested);
    expect(gateway.buildAccountPermissionUpdate).toHaveBeenCalledWith(
      A,
      expect.objectContaining({
        actives: [
          expect.objectContaining({
            operationsHex: "82" + "00".repeat(31),
            unknownOperationIds: [7],
          }),
        ],
      }),
    );
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "active_unknown_operations" }),
    );
  });

  it("allows an offline build even when balance is currently low", async () => {
    const { service, pipeline } = setup("0");
    await expect(
      service.update(scope(), NETWORK, { buildOnly: true }, permissions()),
    ).resolves.toBeDefined();
    expect(pipeline.assertCanSign).not.toHaveBeenCalled();
  });

  it("rejects insufficient balance before constructing a broadcast transaction", async () => {
    const { service, gateway, pipeline } = setup("99999999");
    await expect(service.update(scope(), NETWORK, {}, permissions())).rejects.toMatchObject({
      code: "insufficient_balance",
    });
    expect(gateway.buildAccountPermissionUpdate).not.toHaveBeenCalled();
    expect(pipeline.runTron).not.toHaveBeenCalled();
  });

  it("rejects insufficient balance on --dry-run too", async () => {
    const { service, gateway } = setup("99999999");
    await expect(
      service.update(scope(), NETWORK, { dryRun: true }, permissions()),
    ).rejects.toMatchObject({ code: "insufficient_balance" });
    expect(gateway.buildAccountPermissionUpdate).not.toHaveBeenCalled();
  });

  it("does not gate --sign-only on balance, since broadcast happens later", async () => {
    const { service } = setup("0");
    await expect(
      service.update(scope(), NETWORK, { signOnly: true }, permissions()),
    ).resolves.toBeDefined();
  });

  it("keeps the confirmed receipt when the permission re-read cannot be performed", async () => {
    const { service } = setup("200000000", {
      outcome: { stage: "confirmed", txId: "tx-confirmed" },
      showPermissions: async () => {
        throw new Error("connect ETIMEDOUT");
      },
    });
    const ctx = scope();

    const result = await service.update(ctx, NETWORK, {}, permissions());

    expect(result).toMatchObject({
      kind: "permission-update",
      stage: "confirmed",
      txId: "tx-confirmed",
    });
    expect(result).not.toHaveProperty("permissions");
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "permission_postcheck_unavailable",
      }),
    );
  });

  it("still reports a genuine mismatch under the unchanged warning code", async () => {
    const divergent = permissions();
    divergent.owner.threshold = 1;
    const { service } = setup("200000000", {
      outcome: { stage: "confirmed", txId: "tx-confirmed" },
      showPermissions: async () => divergent,
    });
    const ctx = scope();

    const result = await service.update(ctx, NETWORK, {}, permissions());

    expect(result).toMatchObject({ stage: "confirmed", txId: "tx-confirmed" });
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "permission_postcheck_mismatch",
      }),
    );
  });
});

describe("TRON permission update signing lifecycle", () => {
  const NOW = 1_900_000_000_000;

  afterEach(() => vi.useRealTimers());

  it("refuses to broadcast a transaction that expired while it was being signed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const transaction = {
      txID: "tx",
      raw_data: {
        contract: [{ type: "AccountPermissionUpdateContract", Permission_id: 0 }],
        timestamp: NOW,
        expiration: NOW + 1_000,
      },
      raw_data_hex: "",
    };
    const broadcast = vi.fn(async () => ({ txId: "tx" }));
    const gateway = {
      getUpdateAccountPermissionFee: async () => 100_000_000,
      getNativeBalance: async () => "200000000",
      buildAccountPermissionUpdate: async () => transaction,
      prepareTransaction: (tx: unknown) => tx,
      encodeTransactionHex: () => "abcd",
      getSignWeight: async () => ({
        permission: { id: 0, name: "owner", threshold: 1, keys: [{ address: A, weight: 1 }] },
        approvedList: [],
        currentWeight: 0,
        resultCode: "NOT_ENOUGH_PERMISSION",
      }),
      getApprovedList: async () => [],
      broadcast,
    } as unknown as TronGateway;
    const signer: Signer = {
      kind: "software",
      address: A,
      sign: async (tx) => {
        vi.setSystemTime(NOW + 5_000);
        return { ...(tx as object), signature: ["ab"] } as never;
      },
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: () => {}, resolve: () => signer } as unknown as SignerResolver;
    const provider = { get: () => gateway } as unknown as ChainGatewayProvider;
    const service = new TronPermissionService(
      provider,
      accounts(),
      new TxPipeline(signers, new SigningService(provider)),
    );

    await expect(service.update(scope(), NETWORK, {}, permissions())).rejects.toMatchObject({
      code: "tx_expired",
    });
    expect(broadcast).not.toHaveBeenCalled();
  });
});
