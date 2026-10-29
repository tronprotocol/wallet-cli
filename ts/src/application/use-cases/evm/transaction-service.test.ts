import { describe, expect, it, vi } from "vitest";
import { EvmTransactionService } from "./transaction-service.js";
import { ChainError, classifyError, errorMessage } from "../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import { decodeEvmRawTransaction } from "../../../adapters/outbound/chain/evm/evm.js";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RECEIVER = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

const SEPOLIA = {
  id: "eip155:11155111",
  family: "evm",
  nativeSymbol: "ETH",
  chainId: "11155111",
  capabilities: [],
} satisfies NetworkDescriptor;

function scope(): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => OWNER,
    timeoutMs: 100,
    wait: false,
    waitTimeoutMs: 100,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

// Run the real build/estimate callbacks without signing or broadcasting.
function harness(over: Partial<Record<string, unknown>> = {}) {
  const gateway = {
    getTransactionCount: vi.fn(async () => (over.nonce as string) ?? "5"),
    feeData: vi.fn(
      async () =>
        (over.fee as object) ?? {
          baseFeeWei: "100",
          gasPriceWei: "110",
          suggestedPriorityWei: "10",
        },
    ),
    estimateGas: vi.fn(async () => (over.gasEstimate as string) ?? "21000"),
    encodeErc20Transfer: vi.fn(() => "0xa9059cbb-encoded"),
    getErc20Metadata: vi.fn(
      async () => (over.metadata as object) ?? { symbol: "TKN", decimals: 6 },
    ),
  };
  const built: Record<string, unknown>[] = [];
  const pipeline = {
    assertCanSign: vi.fn(),
    run: vi.fn(async (params: TxPipelineParams) => {
      const tx = (await params.build(OWNER)) as Record<string, unknown>;
      built.push(tx);
      return { stage: "plan" as const, tx, fee: await params.estimate(tx) };
    }),
  } as unknown as TxPipeline;
  const recipients = { resolve: vi.fn(() => ({ address: RECEIVER })) };
  const tokens = { effective: () => [] };
  const service = new EvmTransactionService(
    { get: () => gateway } as unknown as ChainGatewayProvider,
    tokens as never,
    pipeline,
    recipients as never,
  );
  return { service, gateway, built, pipeline, recipients };
}

describe("EvmTransactionService.send — native transfer", () => {
  it("builds a type-2 transaction with the resolved recipient and scaled value", async () => {
    const { service, built } = harness();
    await service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1", feeLimit: "0" } as never);

    expect(built[0]).toMatchObject({
      type: 2,
      chainId: 11155111,
      to: RECEIVER,
      value: "1000000000000000000",
      nonce: 5,
      gasLimit: "21000",
      maxFeePerGas: "210",
      maxPriorityFeePerGas: "10",
    });
  });

  it("takes the nonce from the pending block", async () => {
    const { service, gateway } = harness();
    await service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1" } as never);

    expect(gateway.getTransactionCount).toHaveBeenCalledWith(OWNER, "pending");
  });

  it("warns when an explicit nonce leaves a gap above the pending nonce", async () => {
    const { service, gateway } = harness({ nonce: "42" });
    const transactionScope = scope();

    await service.send(transactionScope, SEPOLIA, {
      to: RECEIVER,
      amount: "1",
      nonce: 44,
    } as never);

    expect(gateway.getTransactionCount).toHaveBeenCalledWith(OWNER, "pending");
    expect(transactionScope.warn).toHaveBeenCalledWith(expect.stringMatching(/nonce 44.*42.*gap/i));
  });

  it("still builds when --nonce is given and the pending-nonce read fails", async () => {
    const gateway = {
      getTransactionCount: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
      feeData: vi.fn(async () => ({
        baseFeeWei: "100",
        gasPriceWei: "110",
        suggestedPriorityWei: "10",
      })),
      estimateGas: vi.fn(async () => "21000"),
      encodeErc20Transfer: vi.fn(() => "0xa9059cbb-encoded"),
      getErc20Metadata: vi.fn(async () => ({ symbol: "TKN", decimals: 6 })),
    };
    const built: Record<string, unknown>[] = [];
    const pipeline = {
      assertCanSign: vi.fn(),
      run: vi.fn(async (params: TxPipelineParams) => {
        const tx = (await params.build(OWNER)) as Record<string, unknown>;
        built.push(tx);
        return { stage: "plan" as const, tx, fee: await params.estimate(tx) };
      }),
    } as unknown as TxPipeline;
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      pipeline,
      { resolve: vi.fn(() => ({ address: RECEIVER })) } as never,
    );
    const transactionScope = scope();

    const out = await service.send(transactionScope, SEPOLIA, {
      to: RECEIVER,
      amount: "1",
      nonce: 44,
    } as never);

    expect((out as { nonce?: number }).nonce).toBe(44);
    expect(built[0]).toMatchObject({ nonce: 44 });
    expect(transactionScope.warn).not.toHaveBeenCalled();
  });

  it("refuses to sign before anything else when the account cannot sign", async () => {
    const { service, pipeline } = harness();
    await service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1" } as never);

    expect(pipeline.assertCanSign).toHaveBeenCalledWith("wlt_test", "evm");
  });

  it("passes --raw-amount through without scaling it", async () => {
    const { service, built } = harness();
    await service.send(scope(), SEPOLIA, { to: RECEIVER, rawAmount: "12345" } as never);

    expect(built[0]!.value).toBe("12345");
  });

  it("rejects a pending nonce that cannot be represented safely", async () => {
    const { service } = harness({ nonce: "9007199254740993" });

    await expect(
      service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1" } as never),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("rejects an unsafe chain id before building a transaction", async () => {
    const { service } = harness();
    const unsafeChain = { ...SEPOLIA, chainId: "9007199254740993" } satisfies NetworkDescriptor;

    await expect(
      service.send(scope(), unsafeChain, { to: RECEIVER, amount: "1" } as never),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });
});

describe("EvmTransactionService.send — fee overrides", () => {
  it("honours the four gas flags", async () => {
    const { service, built } = harness();
    await service.send(scope(), SEPOLIA, {
      to: RECEIVER,
      amount: "1",
      gasLimit: "90000",
      maxFee: "500",
      priorityFee: "20",
      nonce: 42,
    } as never);

    expect(built[0]).toMatchObject({
      gasLimit: "90000",
      maxFeePerGas: "500",
      maxPriorityFeePerGas: "20",
      nonce: 42,
    });
  });

  it("builds a legacy transaction on a chain with no base fee", async () => {
    const { service, built } = harness({ fee: { gasPriceWei: "3000000000" } });
    await service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1" } as never);

    expect(built[0]).toMatchObject({ type: 0, gasPrice: "3000000000" });
    expect(built[0]!.maxFeePerGas).toBeUndefined();
  });

  it("rejects a 1559 flag on a legacy chain instead of ignoring it", async () => {
    const { service } = harness({ fee: { gasPriceWei: "3000000000" } });

    await expect(
      service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1", maxFee: "500" } as never),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });
});

describe("EvmTransactionService.send — ERC-20 transfer", () => {
  it("sends to the contract with encoded calldata and zero value", async () => {
    const { service, built, gateway } = harness();
    await service.send(scope(), SEPOLIA, {
      to: RECEIVER,
      contract: USDT,
      amount: "5",
      decimals: 6,
    } as never);

    expect(gateway.encodeErc20Transfer).toHaveBeenCalled();
    expect(built[0]).toMatchObject({ to: USDT, value: "0", data: "0xa9059cbb-encoded" });
  });

  it("scales a token amount by the token's decimals, not the chain's", async () => {
    const { service, gateway } = harness();
    await service.send(scope(), SEPOLIA, {
      to: RECEIVER,
      contract: USDT,
      amount: "5",
      decimals: 6,
    } as never);

    expect(gateway.encodeErc20Transfer).toHaveBeenCalledWith(RECEIVER, "5000000");
  });

  it("refuses a token transfer whose decimals it could not establish", async () => {
    const { service } = harness({ metadata: {} });

    await expect(
      service.send(scope(), SEPOLIA, { to: RECEIVER, contract: USDT, amount: "5" } as never),
    ).rejects.toMatchObject({ code: "token_metadata_unavailable" });
  });
});

describe("EvmTransactionService.send — the transaction it hands over", () => {
  it("carries no bookkeeping fields of its own", async () => {
    const { service, built } = harness();
    await service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1" } as never);

    expect(built[0]).not.toHaveProperty("fee");
    expect(Object.keys(built[0]!).sort()).toEqual(
      [
        "chainId",
        "gasLimit",
        "maxFeePerGas",
        "maxPriorityFeePerGas",
        "nonce",
        "to",
        "type",
        "value",
      ].sort(),
    );
  });

  it("still reports the fee plan through the pipeline's estimate hook", async () => {
    const { service } = harness();
    const out = (await service.send(scope(), SEPOLIA, {
      to: RECEIVER,
      amount: "1",
      dryRun: true,
    } as never)) as { fee?: Record<string, unknown> };

    expect(out.fee).toMatchObject({ feeModel: "eip1559", maxCostWei: String(21000n * 210n) });
  });
});

describe("EvmTransactionService.send — --contract without a book entry", () => {
  it("asks the contract for its decimals and scales by them", async () => {
    const { service, built, gateway } = harness({
      metadata: { symbol: "USDC", decimals: 6, name: "USD Coin" },
    });

    const out = (await service.send(scope(), SEPOLIA, {
      to: RECEIVER,
      contract: USDT,
      amount: "0.5",
      dryRun: true,
    } as never)) as Record<string, unknown>;

    expect(gateway.getErc20Metadata).toHaveBeenCalledWith(USDT);
    expect(out.rawAmount).toBe("500000");
    expect(out.decimals).toBe(6);
    expect(out.symbol ?? out.token).toBe("USDC");
    expect(built[0]).toMatchObject({ to: USDT });
  });

  it("refuses to guess when the contract does not answer decimals()", async () => {
    const { service } = harness({ metadata: {} });

    const error = await service
      .send(scope(), SEPOLIA, {
        to: RECEIVER,
        contract: USDT,
        amount: "0.5",
        dryRun: true,
      } as never)
      .catch((e) => e);

    expect(error).toMatchObject({ code: "token_metadata_unavailable" });
    expect(error.message).toMatch(/--raw-amount|token add/);
  });

  it("does not need decimals at all for --raw-amount", async () => {
    const { service, gateway } = harness({ metadata: {} });

    const out = (await service.send(scope(), SEPOLIA, {
      to: RECEIVER,
      contract: USDT,
      rawAmount: "500000",
      dryRun: true,
    } as never)) as Record<string, unknown>;

    expect(out.rawAmount).toBe("500000");
    expect(gateway.getErc20Metadata).not.toHaveBeenCalled();
  });
});

describe("EvmTransactionService.send — gas estimation", () => {
  it("surfaces the node's refusal instead of signing a guess", async () => {
    const gateway = {
      getTransactionCount: vi.fn(async () => "5"),
      feeData: vi.fn(async () => ({ baseFeeWei: "100", gasPriceWei: "110" })),
      estimateGas: vi.fn(async () => {
        throw new Error("insufficient funds for transfer");
      }),
      encodeErc20Transfer: vi.fn(() => "0xa9059cbb-encoded"),
    };
    const failing = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {
        assertCanSign: vi.fn(),
        run: vi.fn(async (params: TxPipelineParams) => ({
          stage: "plan" as const,
          tx: await params.build(OWNER),
          fee: {},
        })),
      } as unknown as TxPipeline,
      { resolve: vi.fn(() => ({ address: RECEIVER })) } as never,
    );

    const error = await failing
      .send(scope(), SEPOLIA, { to: RECEIVER, amount: "1", dryRun: true } as never)
      .catch((e) => e);

    expect(error).toMatchObject({ code: "rpc_error" });
    expect(error.exitCode()).toBe(1);
    expect(error.message).toMatch(/insufficient funds/);
    expect(error.message).toMatch(/--gas-limit/);
  });

  it("takes --gas-limit as the way past a node that cannot estimate", async () => {
    const gateway = {
      getTransactionCount: vi.fn(async () => "5"),
      feeData: vi.fn(async () => ({ baseFeeWei: "100", gasPriceWei: "110" })),
      estimateGas: vi.fn(async () => {
        throw new Error("execution reverted");
      }),
      encodeErc20Transfer: vi.fn(() => "0xa9059cbb-encoded"),
    };
    const built: unknown[] = [];
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {
        assertCanSign: vi.fn(),
        run: vi.fn(async (params: TxPipelineParams) => {
          const tx = await params.build(OWNER);
          built.push(tx);
          return { stage: "plan" as const, tx, fee: {} };
        }),
      } as unknown as TxPipeline,
      { resolve: vi.fn(() => ({ address: RECEIVER })) } as never,
    );

    await service.send(scope(), SEPOLIA, {
      to: RECEIVER,
      amount: "1",
      gasLimit: "90000",
      dryRun: true,
    } as never);

    expect(built[0]).toMatchObject({ gasLimit: "90000" });
    expect(gateway.estimateGas).not.toHaveBeenCalled();
  });
});

describe("EvmTransactionService.sign", () => {
  function signHarness(signed: unknown = { raw: "0x02signed", hash: `0x${"ab".repeat(32)}` }) {
    const seen: unknown[] = [];
    const pipeline = {
      assertCanSign: vi.fn(),
      signOnly: vi.fn(async (p: { tx: unknown }) => {
        seen.push(p.tx);
        return { stage: "signed" as const, signed };
      }),
    } as unknown as TxPipeline;
    const service = new EvmTransactionService(
      {
        get: () => ({ decodeRawTransaction: decodeEvmRawTransaction }),
      } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      pipeline,
      { resolve: vi.fn() } as never,
    );
    return { service, seen, pipeline };
  }

  // ethers unsignedSerialized fixture.
  const UNSIGNED =
    "0x02f083aa36a780830f4240847944848282520894000000000000000000000000000000000000dead87038d7ea4c6800080c0";

  it("parses the unsigned hex and hands the pipeline a transaction", async () => {
    const { service, seen } = signHarness();
    await service.sign(scope(), SEPOLIA, UNSIGNED);

    expect(seen[0]).toMatchObject({ chainId: "11155111", nonce: 0, sig: null });
  });

  it("returns the signed serialisation and its hash", async () => {
    const { service } = signHarness();
    const out = (await service.sign(scope(), SEPOLIA, UNSIGNED)) as { signed?: unknown };

    expect(out.signed).toMatchObject({ raw: "0x02signed" });
  });

  it("rejects input that is not a transaction rather than signing rubbish", async () => {
    const { service, pipeline } = signHarness();

    await expect(service.sign(scope(), SEPOLIA, "0xnot-a-transaction")).rejects.toMatchObject({
      code: "invalid_transaction",
    });
    expect(pipeline.signOnly).not.toHaveBeenCalled();
  });

  it("refuses a transaction built for another chain before signing it", async () => {
    const { service, pipeline } = signHarness();
    const MAINNET =
      "0x02ed0180830f42408478fbb08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c0";

    await expect(service.sign(scope(), SEPOLIA, MAINNET)).rejects.toMatchObject({
      code: "chain_id_mismatch",
    });
    expect(pipeline.signOnly).not.toHaveBeenCalled();
  });

  it("names the chain mismatch even when the foreign transaction is already signed", async () => {
    const { service } = signHarness();
    const SIGNED_MAINNET =
      "0x02f8700180830f42408478fbb08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c080a0bf5dda9670fd52be2346cdb74cdd238a51a4ae67ac7513fd7540fd78eca31d25a026903a9fcb8d75c83ff1e0177a8dd7061e0ddc7051500a6f1a041be1a2e32ca3";

    await expect(service.sign(scope(), SEPOLIA, SIGNED_MAINNET)).rejects.toMatchObject({
      code: "chain_id_mismatch",
    });
  });

  it("refuses an already-signed transaction instead of double-signing it", async () => {
    const { service } = signHarness();
    const alreadySigned =
      "0x02f87383aa36a780830f424084793b5e8282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a02958ee6a65975b5f6c2067d08704bc367375ee3fd54f1a0b4cbbc2643ab6b95ca0044e8cb5dea54b08c8b43b68a842e75e4f6627caa3911e4f9e5119ca12c01fc9";

    await expect(service.sign(scope(), SEPOLIA, alreadySigned)).rejects.toMatchObject({
      code: "invalid_transaction",
    });
  });
});

describe("EvmTransactionService.broadcast", () => {
  function bcHarness(result: Record<string, unknown> = { hash: `0x${"cd".repeat(32)}` }) {
    const seen: string[] = [];
    const gateway = {
      decodeRawTransaction: decodeEvmRawTransaction,
      sendRawTransaction: vi.fn(async (raw: string) => {
        seen.push(raw);
        return result;
      }),
      getTransactionReceipt: vi.fn(async () => null),
    };
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );
    return { service, seen, gateway };
  }

  const SIGNED =
    "0x02f87383aa36a780830f424084793b5e8282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a02958ee6a65975b5f6c2067d08704bc367375ee3fd54f1a0b4cbbc2643ab6b95ca0044e8cb5dea54b08c8b43b68a842e75e4f6627caa3911e4f9e5119ca12c01fc9";

  it.each(["timeout", "rpc_error", "invalid_node_response"])(
    "retains the local hash and error representation on %s",
    async (code) => {
      const { service, gateway } = bcHarness();
      const original = new ChainError(code, errorMessage`node: ${"untrusted\nvalue"}`, {
        nodeCode: "fixture",
      });
      gateway.sendRawTransaction.mockRejectedValueOnce(original);
      const error = classifyError(
        await service.broadcast(scope(), SEPOLIA, SIGNED).catch((e) => e),
      );
      expect(error.toEnvelope()).toEqual({
        code,
        message: original.message,
        details: {
          nodeCode: "fixture",
          txId: "0x6bfa290e4749ac903192c155d9b0f534ec9a8c8ab9dbb55bd155a91e3c0d7026",
        },
      });
      expect(error.textMessage).toBe(original.textMessage);
      expect(error.kind).toBe(original.kind);
      expect(error.exitCode()).toBe(original.exitCode());
      expect(gateway.sendRawTransaction).toHaveBeenCalledWith(SIGNED);
    },
  );

  it("preserves a definite rejection without an ID", async () => {
    const { service, gateway } = bcHarness();
    const original = new ChainError("transaction_rejected", "refused");
    gateway.sendRawTransaction.mockRejectedValueOnce(original);
    await expect(service.broadcast(scope(), SEPOLIA, SIGNED)).rejects.toBe(original);
    expect(original.details).toBeUndefined();
  });

  it("submits the hex and reports the locally derived hash", async () => {
    const { service, seen } = bcHarness();
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED)) as Record<string, unknown>;

    expect(seen[0]).toBe(SIGNED);
    expect(out.txId).toBe("0x6bfa290e4749ac903192c155d9b0f534ec9a8c8ab9dbb55bd155a91e3c0d7026");
  });

  it("reports an already-known transaction as submitted, not as an error", async () => {
    const { service } = bcHarness({ alreadyKnown: true });
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED)) as Record<string, unknown>;

    expect(out.stage).toBe("submitted");
    expect(out.alreadyKnown).toBe(true);
  });

  it("refuses a transaction built for another chain without submitting it", async () => {
    const { service, seen } = bcHarness();
    const SIGNED_MAINNET =
      "0x02f8700180830f42408478fbb08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c080a0bf5dda9670fd52be2346cdb74cdd238a51a4ae67ac7513fd7540fd78eca31d25a026903a9fcb8d75c83ff1e0177a8dd7061e0ddc7051500a6f1a041be1a2e32ca3";

    await expect(service.broadcast(scope(), SEPOLIA, SIGNED_MAINNET)).rejects.toMatchObject({
      code: "chain_id_mismatch",
      details: undefined,
    });
    expect(seen).toEqual([]);
  });

  it("refuses hex that is not a signed transaction", async () => {
    const { service } = bcHarness();

    await expect(service.broadcast(scope(), SEPOLIA, "0xdeadbeef")).rejects.toMatchObject({
      code: "invalid_transaction",
      details: undefined,
    });
  });
});

describe("EvmTransactionService.broadcast --dry-run", () => {
  const SIGNED =
    "0x02f87383aa36a780830f424084793b5e8282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a02958ee6a65975b5f6c2067d08704bc367375ee3fd54f1a0b4cbbc2643ab6b95ca0044e8cb5dea54b08c8b43b68a842e75e4f6627caa3911e4f9e5119ca12c01fc9";
  // Signed fixture values are wei; gasLimit is 21000.
  const MAX_COST = 21000n * 2033933954n;
  const VALUE = 1000000000000000n;
  const SIGNED_NONCE_5 =
    "0x02f87383aa36a705830f4240847936a08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a0c6bd6e2d48486d0f3cfc0afe941906ed4d2b1e0ddf0d7c420ce309cb71de850da0343d3b1e4e2818e022ad953505750198158dcbd378a50046758b24aafad18c9b";

  function dryHarness(node: Partial<Record<string, unknown>> = {}) {
    const gateway = {
      decodeRawTransaction: decodeEvmRawTransaction,
      sendRawTransaction: vi.fn(async () => ({ hash: `0x${"cd".repeat(32)}` })),
      getTransactionCount: vi.fn(async (_a: string, block?: string) =>
        block === "pending" ? "0" : "0",
      ),
      getNativeBalance: vi.fn(async () => String(VALUE + MAX_COST)),
      ...node,
    };
    const warn = vi.fn();
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );
    return { service, gateway, warn, scope: () => ({ ...scope(), warn }) as never };
  }

  it("does not submit the transaction", async () => {
    const { service, gateway, scope } = dryHarness();
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED, true)) as Record<
      string,
      unknown
    >;

    expect(gateway.sendRawTransaction).not.toHaveBeenCalled();
    expect(out.mode).toBe("dry-run");
    expect(out.stage).toBeUndefined();
  });

  it("reports the transaction it validated, without asking the node for its identity", async () => {
    const { service, scope } = dryHarness();
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED, true)) as Record<
      string,
      unknown
    >;

    expect(out.txId).toBe("0x6bfa290e4749ac903192c155d9b0f534ec9a8c8ab9dbb55bd155a91e3c0d7026");
    expect(out.rawAmount).toBe(String(VALUE));
    expect(out.fee).toMatchObject({ feeModel: "eip1559", maxCostWei: String(MAX_COST) });
    expect(out.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "chainId", status: "ok" })]),
    );
  });

  it("rejects a transaction signed for another chain", async () => {
    const { service, scope } = dryHarness();
    const mainnet = { ...SEPOLIA, id: "eip155:1", chainId: "1" };

    await expect(service.broadcast(scope(), mainnet as never, SIGNED, true)).rejects.toMatchObject({
      code: "chain_id_mismatch",
      details: undefined,
    });
  });

  it("rejects a nonce the account has already spent", async () => {
    const { service, scope } = dryHarness({
      getTransactionCount: vi.fn(async () => "3"),
    });

    await expect(service.broadcast(scope(), SEPOLIA, SIGNED, true)).rejects.toMatchObject({
      code: "nonce_too_low",
      details: undefined,
    });
  });

  it("rejects a balance that cannot cover value plus the fee ceiling", async () => {
    const { service, scope } = dryHarness({
      getNativeBalance: vi.fn(async () => String(VALUE + MAX_COST - 1n)),
    });

    await expect(service.broadcast(scope(), SEPOLIA, SIGNED, true)).rejects.toMatchObject({
      code: "insufficient_balance",
      details: undefined,
    });
  });

  it("warns rather than fails when the nonce leaves a gap", async () => {
    const { service, scope, warn } = dryHarness({
      getTransactionCount: vi.fn(async () => "2"),
      getNativeBalance: vi.fn(async () => String(VALUE + 21000n * 2033623170n)),
    });
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED_NONCE_5, true)) as Record<
      string,
      unknown
    >;

    expect(out.mode).toBe("dry-run");
    expect(out.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "nonce", status: "warning" })]),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("gap"));
  });

  it("degrades to the local checks when the node is unreachable", async () => {
    const { service, scope, warn } = dryHarness({
      getTransactionCount: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    });
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED, true)) as Record<
      string,
      unknown
    >;

    expect(out.mode).toBe("dry-run");
    expect(out.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "nonce", status: "skipped" }),
        expect.objectContaining({ name: "balance", status: "skipped" }),
      ]),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not checked"));
  });

  it("still refuses an unsigned transaction", async () => {
    const { service, scope } = dryHarness();
    const unsigned =
      "0x02f083aa36a780830f4240847944848282520894000000000000000000000000000000000000dead87038d7ea4c6800080c0";

    await expect(service.broadcast(scope(), SEPOLIA, unsigned, true)).rejects.toMatchObject({
      code: "invalid_transaction",
      details: undefined,
    });
  });
});

describe("EvmTransactionService.status", () => {
  function statusHarness(tx: unknown, receipt: unknown, head: string | Error = "42") {
    const warn = vi.fn();
    const gateway = {
      getTransactionByHash: vi.fn(async () => tx),
      getTransactionReceipt: vi.fn(async () => receipt),
      getBlockNumber: vi.fn(async () => {
        if (head instanceof Error) throw head;
        return head;
      }),
    };
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );
    return { service, scope: { ...scope(), warn } as TransactionScope, warn };
  }
  const HASH = `0x${"ab".repeat(32)}`;

  it("reports a mined, successful transaction as confirmed", async () => {
    const { service, scope: s } = statusHarness({ hash: HASH }, { success: true, blockNumber: 10 });

    await expect(service.status(s, SEPOLIA, HASH)).resolves.toMatchObject({
      txid: HASH,
      state: "confirmed",
      confirmed: true,
      failed: false,
      blockNumber: 10,
    });
  });

  it("reports a mined but reverted transaction as failed", async () => {
    const { service, scope: s } = statusHarness(
      { hash: HASH },
      { success: false, blockNumber: 10 },
    );

    await expect(service.status(s, SEPOLIA, HASH)).resolves.toMatchObject({
      state: "failed",
      confirmed: true,
      failed: true,
    });
  });

  it("reports a transaction the node knows but has not mined as pending", async () => {
    const { service, scope: s } = statusHarness({ hash: HASH }, null);

    await expect(service.status(s, SEPOLIA, HASH)).resolves.toMatchObject({
      state: "pending",
      confirmed: false,
    });
  });

  it("reports an unknown hash as not_found", async () => {
    const { service, scope: s } = statusHarness(null, null);

    await expect(service.status(s, SEPOLIA, HASH)).resolves.toMatchObject({ state: "not_found" });
  });

  it("reports head minus the transaction's block as confirmations", async () => {
    const { service, scope: s } = statusHarness(
      { hash: HASH },
      { success: true, blockNumber: 5 },
      "42",
    );

    await expect(service.status(s, SEPOLIA, HASH)).resolves.toMatchObject({ confirmations: 37 });
  });

  it("omits confirmations when the head could not be read, and still answers", async () => {
    const { service, scope: s } = statusHarness(
      { hash: HASH },
      { success: true, blockNumber: 5 },
      new Error("head unreachable"),
    );
    const out = await service.status(s, SEPOLIA, HASH);

    expect(out.state).toBe("confirmed");
    expect(out.confirmations).toBeUndefined();
  });

  it("warns that not_found may mean the node lacks history, not that the tx never existed", async () => {
    const { service, scope: s, warn } = statusHarness(null, null);
    await service.status(s, SEPOLIA, HASH);

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/histor|prun/i));
  });

  it("does not warn when the transaction was found", async () => {
    const { service, scope: s, warn } = statusHarness({ hash: HASH }, { success: true });
    await service.status(s, SEPOLIA, HASH);

    expect(warn).not.toHaveBeenCalled();
  });

  it("fails the command when getTransactionByHash rejects, rather than reporting not_found", async () => {
    const gateway = {
      getTransactionByHash: vi.fn(async () => {
        throw new ChainError("rpc_error", "eth_getTransactionByHash failed: connection refused");
      }),
      getTransactionReceipt: vi.fn(async () => null),
      getBlockNumber: vi.fn(async () => "42"),
    };
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );

    await expect(service.status(scope(), SEPOLIA, HASH)).rejects.toMatchObject({
      code: "rpc_error",
    });
  });

  it("fails the command when getTransactionReceipt rejects, rather than reporting not_found", async () => {
    const gateway = {
      getTransactionByHash: vi.fn(async () => null),
      getTransactionReceipt: vi.fn(async () => {
        throw new ChainError("timeout", "eth_getTransactionReceipt timed out");
      }),
      getBlockNumber: vi.fn(async () => "42"),
    };
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );

    await expect(service.status(scope(), SEPOLIA, HASH)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("still reports not_found, with the node-history warning, when both calls genuinely answer null", async () => {
    const { service, scope: s, warn } = statusHarness(null, null);

    await expect(service.status(s, SEPOLIA, HASH)).resolves.toMatchObject({
      state: "not_found",
      confirmed: false,
      failed: false,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/histor|prun/i));
  });

  it("still succeeds, minus confirmations, when only getBlockNumber fails", async () => {
    const { service, scope: s } = statusHarness(
      { hash: HASH },
      { success: true, blockNumber: 5 },
      new Error("head unreachable"),
    );

    const out = await service.status(s, SEPOLIA, HASH);

    expect(out.state).toBe("confirmed");
    expect(out.confirmations).toBeUndefined();
  });
});

describe("EvmTransactionService.info", () => {
  function infoHarness(
    tx: unknown,
    receipt: unknown = null,
    meta: unknown = { symbol: "USDT", decimals: 6 },
  ) {
    const gateway = {
      getTransactionByHash: vi.fn(async () => tx),
      getTransactionReceipt: vi.fn(async () => receipt),
      getBlockNumber: vi.fn(async () => "42"),
      // Normalized block timestamps are seconds.
      getBlock: vi.fn(async () => ({ number: 5, timestamp: 1722925264, raw: {} })),
      getErc20Metadata: vi.fn(async () => meta),
    };
    return new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );
  }
  const HASH = `0x${"cd".repeat(32)}`;
  const TO = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
  const RAW = { hash: HASH, value: "0xde0b6b3a7640000" };
  const view = (fields: Record<string, unknown> = {}) => ({
    from: OWNER,
    to: TO,
    valueWei: "0",
    input: "0x",
    raw: RAW,
    ...fields,
  });

  it("reports a native transfer's parties and amount", async () => {
    const svc = infoHarness(view({ valueWei: "1000000000000000000", nonce: 7 }), {
      success: true,
      blockNumber: 5,
      gasUsed: "21000",
      feeWei: "1000",
      effectiveGasPriceWei: "50",
    });

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({
      txid: HASH,
      from: OWNER,
      to: TO,
      amount: "1",
      symbol: "ETH",
      blockNumber: 5,
      gasUsed: "21000",
      feeWei: "1000",
      status: "success",
      type: "transfer",
      nonce: 7,
      rawAmount: "1000000000000000000",
      blockTime: 1722925264,
      effectiveGasPriceWei: "50",
      transaction: RAW,
    });
  });

  it.each([
    [{ input: "0x" }, "transfer"],
    [{ input: "0xdeadbeef" }, "contract-call"],
    [{ to: undefined, input: "0x6080" }, "contract-creation"],
    [{ input: "0xa9059cbb", erc20Transfer: { to: TO, rawAmount: "1" } }, "transfer"],
  ])("classifies %o as %s", async (fields, expected) => {
    const svc = infoHarness(view(fields));

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({ type: expected });
  });

  it("omits the recipient of a contract creation instead of reporting an empty one", async () => {
    const out = await infoHarness(view({ to: undefined, input: "0x6080" })).info(
      scope(),
      SEPOLIA,
      HASH,
    );

    expect(out).not.toHaveProperty("to");
  });

  it("still answers when the block's timestamp cannot be read", async () => {
    const gateway = {
      getTransactionByHash: async () => view(),
      getTransactionReceipt: async () => ({ success: true, blockNumber: 5 }),
      getBlockNumber: async () => "42",
      getBlock: async () => {
        throw new Error("pruned");
      },
      getErc20Metadata: async () => ({}),
    };
    const svc = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );

    const out = await svc.info(scope(), SEPOLIA, HASH);
    expect(out.blockNumber).toBe(5);
    expect(out.blockTime).toBeUndefined();
  });

  it("reports an ERC-20 transfer's token recipient and amount", async () => {
    const svc = infoHarness(
      view({ to: USDT, input: "0xa9059cbb", erc20Transfer: { to: TO, rawAmount: "5000000" } }),
    );

    const out = await svc.info(scope(), SEPOLIA, HASH);
    expect(out).toMatchObject({
      from: OWNER,
      to: TO,
      contract: USDT,
      symbol: "USDT",
      amount: "5",
    });
  });

  it("falls back to the base-unit amount when the token's decimals are unreadable", async () => {
    const svc = infoHarness(
      view({ to: USDT, input: "0xa9059cbb", erc20Transfer: { to: TO, rawAmount: "5000000" } }),
      null,
      {},
    );

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({ amount: "5000000" });
  });

  it("leaves calldata it does not recognise alone", async () => {
    const svc = infoHarness(view({ to: USDT, input: "0xdeadbeef" }));

    const out = await svc.info(scope(), SEPOLIA, HASH);
    expect(out.to).toBe(USDT);
    expect(out.contract).toBeUndefined();
  });

  it("refuses a hash the node has never seen", async () => {
    const svc = infoHarness(null);

    await expect(svc.info(scope(), SEPOLIA, HASH)).rejects.toMatchObject({ code: "not_found" });
  });

  it("exits 1, not 2, for a hash the node has never seen", async () => {
    const svc = infoHarness(null);

    try {
      await svc.info(scope(), SEPOLIA, HASH);
      expect.unreachable("expected info() to throw");
    } catch (e) {
      expect((e as { exitCode(): number }).exitCode()).toBe(1);
    }
  });
});

describe("EvmTransactionService.send --dry-run — an explicit nonce the chain has moved past", () => {
  function nonceHarness(counts: { latest: string; pending: string }) {
    const gateway = {
      getTransactionCount: vi.fn(async (_addr: string, block: string) =>
        block === "latest" ? counts.latest : counts.pending,
      ),
      feeData: vi.fn(async () => ({
        baseFeeWei: "100",
        gasPriceWei: "110",
        suggestedPriorityWei: "10",
      })),
      estimateGas: vi.fn(async () => "21000"),
      encodeErc20Transfer: vi.fn(() => "0x"),
      getErc20Metadata: vi.fn(async () => ({ symbol: "TKN", decimals: 6 })),
    };
    const pipeline = {
      assertCanSign: vi.fn(),
      run: vi.fn(async (params: TxPipelineParams) => {
        const tx = (await params.build(OWNER)) as Record<string, unknown>;
        return { stage: "plan" as const, tx, fee: await params.estimate(tx) };
      }),
    } as unknown as TxPipeline;
    const service = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      pipeline,
      { resolve: vi.fn(() => ({ address: RECEIVER })) } as never,
    );
    return { service, gateway };
  }

  const send = (service: EvmTransactionService, input: Record<string, unknown>) =>
    service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1", ...input } as never);

  it("refuses a nonce below the mined count", async () => {
    const { service } = nonceHarness({ latest: "10", pending: "12" });
    await expect(send(service, { dryRun: true, nonce: 9 })).rejects.toThrowError(
      expect.objectContaining({ code: "nonce_too_low" }),
    );
  });

  it("refuses before spending an eth_estimateGas", async () => {
    const { service, gateway } = nonceHarness({ latest: "10", pending: "12" });
    await expect(send(service, { dryRun: true, nonce: 9 })).rejects.toThrow();
    expect(gateway.estimateGas).not.toHaveBeenCalled();
  });

  it("accepts the next nonce the chain expects", async () => {
    const { service } = nonceHarness({ latest: "10", pending: "12" });
    await expect(send(service, { dryRun: true, nonce: 10 })).resolves.toBeDefined();
  });

  it("allows replacing a transaction that is still in the mempool", async () => {
    const { service } = nonceHarness({ latest: "10", pending: "12" });
    await expect(send(service, { dryRun: true, nonce: 11 })).resolves.toBeDefined();
  });

  it("does not read the mined count outside --dry-run", async () => {
    const { service, gateway } = nonceHarness({ latest: "10", pending: "12" });
    await send(service, { buildOnly: true, nonce: 9 });
    expect(gateway.getTransactionCount).not.toHaveBeenCalledWith(OWNER, "latest");
  });

  it("does not read the mined count when no nonce was given", async () => {
    const { service, gateway } = nonceHarness({ latest: "10", pending: "12" });
    await send(service, { dryRun: true });
    expect(gateway.getTransactionCount).not.toHaveBeenCalledWith(OWNER, "latest");
  });

  it("still builds when the mined-count read fails", async () => {
    const { service, gateway } = nonceHarness({ latest: "10", pending: "12" });
    gateway.getTransactionCount.mockImplementation(async (_a: string, block: string) => {
      if (block === "latest") throw new Error("node down");
      return "12";
    });
    await expect(send(service, { dryRun: true, nonce: 9 })).resolves.toBeDefined();
  });
});
