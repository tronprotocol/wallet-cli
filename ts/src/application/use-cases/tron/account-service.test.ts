import { describe, it, expect, vi } from "vitest";
import { TronAccountService } from "./account-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { AccountScope, TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TronHistoryReader } from "../../ports/chain/tron-history-reader.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { PriceProvider } from "../../ports/price-provider.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";

const net: NetworkDescriptor = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const scope: AccountScope = { activeAccount: "wlt_test.0", resolveAddress: () => "TXaddress" };
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const TARGET = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function serviceWith(nativeRaw: string, nativePrice: number | null) {
  const gateway = {
    getNativeBalance: async () => nativeRaw,
    getTrc10Balance: async () => "0",
    getTrc20Balance: async () => "0",
  };
  const gateways = { client: () => gateway, get: () => gateway } as unknown as ChainGatewayProvider;
  const tokens = { effective: () => [] } as unknown as TokenRepository;
  const prices = {
    source: "test",
    nativeUsd: async () => nativePrice,
    tokenUsd: async () => new Map(),
  } as unknown as PriceProvider;
  return new TronAccountService(
    gateways,
    {} as unknown as TronHistoryReader,
    tokens,
    prices,
    {} as never,
  );
}

describe("TronAccountService.portfolio native USD conversion", () => {
  it("prices the native TRX holding from raw sun × price at 6-decimal scale", async () => {
    const result = await serviceWith("1983993000", 0.12).portfolio(scope, net);
    const native = result.holdings.find((h) => h.kind === "native")!;
    expect(native).toMatchObject({
      kind: "native",
      symbol: "TRX",
      decimals: 6,
      rawBalance: "1983993000",
      balance: "1983.993",
      priceUsd: 0.12,
    });
    expect(native.valueUsd).toBe(238.07916); // 1983.993 × 0.12, rounded to 6 dp
    expect(result.totalValueUsd).toBe(238.07916);
    expect(result.priceSource).toBe("test");
  });

  it("leaves native valueUsd + total null when the price source returns null", async () => {
    const result = await serviceWith("1983993000", null).portfolio(scope, net);
    const native = result.holdings.find((h) => h.kind === "native")!;
    expect(native.valueUsd).toBeNull();
    expect(result.totalValueUsd).toBeNull();
  });
});

describe("TronAccountService.portfolio per-token best-effort (issue #9)", () => {
  const TOK = {
    kind: "trc20",
    id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    symbol: "USDT",
    decimals: 6,
    name: "Tether",
    source: "user",
  };

  function serviceWithFailingToken() {
    const gateway = {
      getNativeBalance: async () => "1000000",
      getTrc10Balance: async () => "0",
      getTrc20Balance: async () => {
        throw new Error("TRON trc20 balanceOf failed: HTTP 500");
      },
    };
    const gateways = {
      client: () => gateway,
      get: () => gateway,
    } as unknown as ChainGatewayProvider;
    const tokens = { effective: () => [TOK] } as unknown as TokenRepository;
    const prices = {
      source: "test",
      nativeUsd: async () => 0.1,
      tokenUsd: async () => new Map([[TOK.id, 1]]),
    } as unknown as PriceProvider;
    return new TronAccountService(
      gateways,
      {} as unknown as TronHistoryReader,
      tokens,
      prices,
      {} as never,
    );
  }

  it("one unreadable token degrades to a stable reason without leaking the raw error (I-06)", async () => {
    const result = await serviceWithFailingToken().portfolio(scope, net);
    // native still resolved
    const native = result.holdings.find((h) => h.kind === "native")!;
    expect(native.balance).toBe("1"); // 1_000_000 sun / 1e6
    // the failing token is present but degraded, not thrown
    const token = result.holdings.find((h) => h.symbol === "USDT")!;
    expect(token.rawBalance).toBeNull();
    expect(token.balance).toBeNull();
    expect(token.valueUsd).toBeNull();
    // stable enum, and the raw downstream message must NOT survive into the payload
    expect(token.balanceUnavailable).toBe(true);
    expect(token.reason).toBe("rpc_error");
    expect(JSON.stringify(token)).not.toContain("HTTP 500");
    // total counts only the readable holdings (native), not the degraded token
    expect(result.totalValueUsd).toBe(0.1); // 1 × 0.1
  });

  it("a failing price source degrades to a stable reason without leaking the raw error (I-06)", async () => {
    const gateway = {
      getNativeBalance: async () => "1000000",
      getTrc10Balance: async () => "0",
      getTrc20Balance: async () => "0",
    };
    const gateways = {
      client: () => gateway,
      get: () => gateway,
    } as unknown as ChainGatewayProvider;
    const tokens = { effective: () => [TOK] } as unknown as TokenRepository;
    const prices = {
      source: "test",
      nativeUsd: async () => {
        throw new Error("request to https://api.provider.com/?key=SECRET failed");
      },
      tokenUsd: async () => new Map(),
    } as unknown as PriceProvider;
    const result = await new TronAccountService(
      gateways,
      {} as unknown as TronHistoryReader,
      tokens,
      prices,
      {} as never,
    ).portfolio(scope, net);
    expect(result.priceUnavailable).toBe(true);
    expect(result.priceReason).toBe("price_provider_error");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});

function transactionScope(wait = false): TransactionScope {
  return {
    activeAccount: "wlt_test.0",
    timeoutMs: 100,
    wait,
    waitTimeoutMs: 100,
    resolveAddress: () => OWNER,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function writeService(
  options: {
    balance?: string;
    getAccount?: (address: string) => Promise<Record<string, unknown>>;
    getAccountById?: (id: string) => Promise<Record<string, unknown>>;
    outcome?: Record<string, unknown>;
  } = {},
) {
  const gateway = {
    getAccount: vi.fn(options.getAccount ?? (async () => ({}))),
    getAccountById: vi.fn(options.getAccountById ?? (async () => ({}))),
    getChainParameters: vi.fn(async () => [
      { key: "getCreateAccountFee", value: 100_000 },
      { key: "getCreateNewAccountFeeInSystemContract", value: 1_000_000 },
    ]),
    getNativeBalance: vi.fn(async () => options.balance ?? "2000000"),
    buildAccountCreate: vi.fn(async () => ({ txID: "create" })),
    buildAccountUpdate: vi.fn(async () => ({ txID: "name" })),
    buildSetAccountId: vi.fn(async () => ({ txID: "id" })),
    prepareTransaction: vi.fn((transaction) => transaction),
    encodeTransactionHex: vi.fn(() => "abcd"),
  } as unknown as TronGateway;
  let captured: TxPipelineParams | undefined;
  const pipeline = {
    assertCanSign: vi.fn(),
    run: vi.fn(async (params: TxPipelineParams) => {
      captured = params;
      if (options.outcome) return options.outcome;
      const transaction = await params.build(OWNER);
      const fee = await params.estimate(transaction);
      if (params.buildOnly) {
        return {
          stage: "built" as const,
          tx: transaction,
          hex: params.artifact!(transaction),
          fee,
        };
      }
      return {
        stage: "plan" as const,
        tx: transaction,
        fee,
      };
    }),
  } as unknown as TxPipeline;
  const provider = {
    get: () => gateway,
  } as unknown as ChainGatewayProvider;
  const service = new TronAccountService(
    provider,
    {} as TronHistoryReader,
    {} as TokenRepository,
    {} as PriceProvider,
    pipeline,
  );
  return { service, gateway, pipeline, captured: () => captured };
}

describe("TronAccountService account lifecycle writes", () => {
  it("dry-runs activation with both dynamic creation fees and no signer gate", async () => {
    const { service, gateway, pipeline, captured } = writeService();
    const result = await service.activate(transactionScope(), net, {
      address: TARGET,
      dryRun: true,
      permissionId: 2,
    });

    expect(result).toMatchObject({
      kind: "account-activate",
      mode: "dry-run",
      address: TARGET,
      payer: OWNER,
      fee: {
        createAccountFeeSun: "100000",
        systemContractFeeSun: "1000000",
        minimumFeeSun: "1100000",
      },
    });
    expect(gateway.buildAccountCreate).toHaveBeenCalledWith(OWNER, TARGET);
    expect(pipeline.assertCanSign).not.toHaveBeenCalled();
    expect(captured()?.permissionId).toBe(2);
  });

  it("rejects an already activated target before transaction construction", async () => {
    const { service, pipeline } = writeService({
      getAccount: async () => ({ address: TARGET }),
    });

    await expect(
      service.activate(transactionScope(), net, {
        address: TARGET,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "account_already_active" });
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it("enforces the complete activation fee for dry-run and broadcast", async () => {
    const { service, pipeline } = writeService({ balance: "1099999" });

    await expect(
      service.activate(transactionScope(), net, {
        address: TARGET,
        dryRun: true,
      }),
    ).rejects.toMatchObject({
      code: "insufficient_balance",
      details: { balance: "1099999", required: "1100000" },
    });
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it("allows an offline account build even when the payer balance is currently low", async () => {
    const { service } = writeService({ balance: "0" });
    const result = await service.activate(transactionScope(), net, {
      address: TARGET,
      buildOnly: true,
      expiration: 60_000,
    });

    expect(result).toMatchObject({
      kind: "account-activate",
      mode: "build-only",
      hex: "abcd",
    });
  });

  it("builds the exact one-time account name after checking activation", async () => {
    const { service, gateway } = writeService({
      getAccount: async () => ({ address: OWNER }),
    });
    const result = await service.setOnChain(transactionScope(), net, {
      name: "Acme Treasury",
      dryRun: true,
    });

    expect(result).toMatchObject({
      kind: "account-set",
      mode: "dry-run",
      field: "name",
      value: "Acme Treasury",
      address: OWNER,
    });
    expect(gateway.buildAccountUpdate).toHaveBeenCalledWith(OWNER, "Acme Treasury");
    expect(gateway.getAccountById).not.toHaveBeenCalled();
  });

  it("rejects a previously set name and a globally occupied ID", async () => {
    const named = writeService({
      getAccount: async () => ({
        address: OWNER,
        account_name: Buffer.from("existing", "utf8").toString("hex"),
      }),
    });
    await expect(
      named.service.setOnChain(transactionScope(), net, {
        name: "new-name",
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "name_already_set" });

    const occupied = writeService({
      getAccount: async () => ({ address: OWNER }),
      getAccountById: async () => ({ address: TARGET }),
    });
    await expect(
      occupied.service.setOnChain(transactionScope(), net, {
        id: "acme-001",
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "id_taken" });
  });

  it("validates name and ID limits in UTF-8 bytes", async () => {
    const { service } = writeService({
      getAccount: async () => ({ address: OWNER }),
    });

    await expect(
      service.setOnChain(transactionScope(), net, {
        name: "账".repeat(11),
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    await expect(
      service.setOnChain(transactionScope(), net, {
        id: "short",
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    await expect(
      service.setOnChain(transactionScope(), net, {
        id: "账".repeat(10),
        dryRun: true,
      }),
    ).resolves.toMatchObject({ field: "id", value: "账".repeat(10) });
  });

  // The post-check runs AFTER the fee is paid and the transaction is confirmed. A lagging node or a
  // transient RPC failure there must never replace the confirmed txid with a command failure —
  // callers would retry an operation that already succeeded.
  describe("post-check never overwrites a confirmed receipt", () => {
    const CONFIRMED = { stage: "confirmed", txId: "tx-confirmed", failed: false };

    /** first call is the pre-check, second is the post-check. */
    function twoReads(
      first: () => Promise<Record<string, unknown>>,
      second: () => Promise<Record<string, unknown>>,
    ) {
      let calls = 0;
      return async () => (++calls === 1 ? first() : second());
    }

    it("activate: an unreadable post-check degrades to a warning", async () => {
      const { service } = writeService({
        outcome: CONFIRMED,
        getAccount: twoReads(
          async () => ({}),
          async () => {
            throw new Error("connect ETIMEDOUT https://nile.trongrid.io/wallet/getaccount");
          },
        ),
      });
      const ctx = transactionScope();

      const result = await service.activate(ctx, net, { address: TARGET });

      expect(result).toMatchObject({
        kind: "account-activate",
        stage: "confirmed",
        txId: "tx-confirmed",
      });
      expect(ctx.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "account_activate_postcheck_unavailable",
        }),
      );
    });

    it("activate: a node that cannot see the account yet warns instead of throwing", async () => {
      const { service } = writeService({
        outcome: CONFIRMED,
        getAccount: twoReads(
          async () => ({}),
          async () => ({}),
        ),
      });
      const ctx = transactionScope();

      const result = await service.activate(ctx, net, { address: TARGET });

      expect(result).toMatchObject({ stage: "confirmed", txId: "tx-confirmed" });
      expect(ctx.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "account_activate_postcheck_mismatch",
        }),
      );
    });

    it("set: an unreadable post-check degrades to a warning", async () => {
      const { service } = writeService({
        outcome: CONFIRMED,
        getAccount: twoReads(
          async () => ({ address: OWNER }),
          async () => {
            throw new Error("HTTP 429 Too Many Requests");
          },
        ),
      });
      const ctx = transactionScope();

      const result = await service.setOnChain(ctx, net, { name: "Acme Treasury" });

      expect(result).toMatchObject({
        kind: "account-set",
        stage: "confirmed",
        txId: "tx-confirmed",
      });
      expect(ctx.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "account_set_postcheck_unavailable",
        }),
      );
    });

    it("the warning explains the state without leaking endpoint credentials", async () => {
      const { service } = writeService({
        outcome: CONFIRMED,
        getAccount: twoReads(
          async () => ({}),
          async () => {
            throw new Error("request to https://user:pw@node.example/wallet failed");
          },
        ),
      });
      const ctx = transactionScope();

      await service.activate(ctx, net, { address: TARGET });

      const [warning] = vi.mocked(ctx.warn).mock.calls[0]! as [{ message: string }];
      expect(warning.message).toContain("confirmed on chain");
      expect(warning.message).not.toContain("user:pw");
    });
  });

  it("fails a signing mode before RPC when the active account cannot sign", async () => {
    const { service, gateway, pipeline } = writeService();
    vi.mocked(pipeline.assertCanSign).mockImplementation(() => {
      throw Object.assign(new Error("watch only"), {
        code: "watch_only_no_signer",
      });
    });

    await expect(
      service.activate(transactionScope(), net, {
        address: TARGET,
      }),
    ).rejects.toMatchObject({ code: "watch_only_no_signer" });
    expect(gateway.getAccount).not.toHaveBeenCalled();
  });

  // The Ledger TRON app parses a fixed set of contract types (app-tron src/parse.c). AccountCreate
  // and SetAccountId are not among them: the device answers 0x6a80 after the user has already been
  // sent to fetch, unlock and open the app. These must be refused up front like contract deploy and
  // cancel-all-unfreeze already are. AccountUpdate IS parsed, so `set --name` must stay available.
  describe("contract types the Ledger TRON app cannot parse", () => {
    /** stands in for the real SignerResolver rule: a Ledger account fails a software-only gate. */
    function ledgerAccount(pipeline: TxPipeline) {
      vi.mocked(pipeline.assertCanSign).mockImplementation((_account, _family, opts) => {
        if (opts?.requireSoftware) {
          throw Object.assign(new Error("ledger"), { code: "ledger_unsupported" });
        }
      });
    }

    it("refuses activation on a Ledger account before any RPC", async () => {
      const { service, gateway, pipeline } = writeService();
      ledgerAccount(pipeline);

      await expect(
        service.activate(transactionScope(), net, {
          address: TARGET,
        }),
      ).rejects.toMatchObject({ code: "ledger_unsupported" });
      expect(gateway.getAccount).not.toHaveBeenCalled();
    });

    it("refuses `set --id` on a Ledger account before any RPC", async () => {
      const { service, gateway, pipeline } = writeService({
        getAccount: async () => ({ address: OWNER }),
      });
      ledgerAccount(pipeline);

      await expect(
        service.setOnChain(transactionScope(), net, {
          id: "acme-001",
        }),
      ).rejects.toMatchObject({ code: "ledger_unsupported" });
      expect(gateway.getAccount).not.toHaveBeenCalled();
    });

    it("still allows `set --name` on a Ledger account", async () => {
      const { service, gateway, pipeline } = writeService({
        getAccount: async () => ({ address: OWNER }),
      });
      ledgerAccount(pipeline);

      await service.setOnChain(transactionScope(), net, { name: "Acme Treasury" });

      expect(gateway.buildAccountUpdate).toHaveBeenCalledWith(OWNER, "Acme Treasury");
    });
  });
});
