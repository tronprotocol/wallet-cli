/**
 * EvmTransactionService.send — what actually gets signed.
 *
 * The fake pipeline runs the real `build` and `estimate` callbacks, so these assert the
 * transaction the wallet would put in front of a key, not a mock of one.
 */
import { describe, expect, it, vi } from "vitest";
import { EvmTransactionService } from "./transaction-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RECEIVER = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

const SEPOLIA = {
  id: "evm:11155111",
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

/** captures the built transaction by running the pipeline's own callbacks. */
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
      // 1 ETH at 18 decimals — the family's decimals, not a hardcoded 6.
      value: "1000000000000000000",
      nonce: 5,
      gasLimit: "21000",
      maxFeePerGas: "210",
      maxPriorityFeePerGas: "10",
    });
  });

  // A nonce read at "latest" would refuse to queue behind an unconfirmed transaction of our own.
  it("takes the nonce from the pending block", async () => {
    const { service, gateway } = harness();
    await service.send(scope(), SEPOLIA, { to: RECEIVER, amount: "1" } as never);

    expect(gateway.getTransactionCount).toHaveBeenCalledWith(OWNER, "pending");
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

    // 5 USDT at 6 decimals is 5_000_000 — using 18 would overpay by a factor of a trillion.
    expect(gateway.encodeErc20Transfer).toHaveBeenCalledWith(RECEIVER, "5000000");
  });

  // This used to assert that a bare --contract ALWAYS failed, which is what the flag actually did
  // — nothing resolved its decimals. The rule it should have been asserting is narrower: refuse
  // when decimals cannot be established, from the book or from the contract itself.
  it("refuses a token transfer whose decimals it could not establish", async () => {
    const { service } = harness({ metadata: {} });

    await expect(
      service.send(scope(), SEPOLIA, { to: RECEIVER, contract: USDT, amount: "5" } as never),
    ).rejects.toMatchObject({ code: "token_metadata_unavailable" });
  });
});

describe("EvmTransactionService.send — the transaction it hands over", () => {
  // The built transaction is echoed verbatim by --dry-run and --build-only, so it must contain
  // only transaction fields. A fee plan smuggled through it as a courier reads like part of the
  // transaction and is not one.
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

/**
 * `--contract` without the token in the address book.
 *
 * The flag is offered on EVM but nothing resolved its decimals: the inbound layer has no
 * --decimals flag and only `--token <symbol>` consulted the book, so `--contract 0x… --amount N`
 * always failed as token_metadata_unavailable — even for a contract whose decimals() answers.
 * TRON has always asked the contract in this case; EVM now does the same.
 */
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
    // 0.5 at six decimals — scaled by the TOKEN's decimals, never the chain's eighteen.
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

/**
 * A failed gas estimate.
 *
 * It used to be swallowed and replaced with 21000, so an ERC-20 transfer was signed with the gas
 * limit of a plain value transfer and failed at broadcast — or, on a node that accepts an
 * under-limit transaction, on-chain with the fee burned.
 */
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

    // A node-side refusal, so a node-side code and exit 1 — not `invalid_option` / exit 2, which
    // would tell a caller its command line was wrong (see evm-gas-estimate.ts).
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

/**
 * `tx sign` and `tx broadcast` on EVM.
 *
 * An EVM transaction carries exactly one signature — there is no multi-signature accumulation to
 * relay — so signing takes an UNSIGNED serialisation and returns the signed one. That symmetry is
 * why `tx broadcast` accepts only `--hex`/`--file`: the artifact both ends exchange is raw hex,
 * and TRON's `--transaction` JSON has no EVM meaning.
 */
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
      { get: () => ({}) } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      pipeline,
      { resolve: vi.fn() } as never,
    );
    return { service, seen, pipeline };
  }

  // Produced with ethers' own `unsignedSerialized`, not written by hand: a hand-rolled RLP body
  // is exactly the kind of fixture that fails for a reason unrelated to what is being tested.
  const UNSIGNED =
    "0x02f083aa36a780830f4240847944848282520894000000000000000000000000000000000000dead87038d7ea4c6800080c0";

  it("parses the unsigned hex and hands the pipeline a transaction", async () => {
    const { service, seen } = signHarness();
    await service.sign(scope(), SEPOLIA, UNSIGNED);

    // ethers' toJSON carries bigints as strings; the signer re-parses them.
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

  /**
   * The one mistake `tx sign` must not make quietly.
   *
   * Both transactions are EVM, so `family_mismatch` never fires; and signing consults no node, so
   * nothing downstream can catch it either. Without this guard the command hands back a perfectly
   * valid MAINNET transaction and says nothing about it.
   */
  it("refuses a transaction built for another chain before signing it", async () => {
    const { service, pipeline } = signHarness();
    // ethers' own unsignedSerialized for the same shape as UNSIGNED, but chainId 1.
    const MAINNET =
      "0x02ed0180830f42408478fbb08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c0";

    await expect(service.sign(scope(), SEPOLIA, MAINNET)).rejects.toMatchObject({
      code: "chain_id_mismatch",
    });
    expect(pipeline.signOnly).not.toHaveBeenCalled();
  });

  // The check runs BEFORE the already-signed check: a foreign-chain transaction is refused for
  // being foreign, which is the fact the reader needs, not for carrying a signature.
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
    return { service, seen };
  }

  const SIGNED =
    "0x02f87383aa36a780830f424084793b5e8282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a02958ee6a65975b5f6c2067d08704bc367375ee3fd54f1a0b4cbbc2643ab6b95ca0044e8cb5dea54b08c8b43b68a842e75e4f6627caa3911e4f9e5119ca12c01fc9";

  it("submits the hex and reports the locally derived hash", async () => {
    const { service, seen } = bcHarness();
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED)) as Record<string, unknown>;

    expect(seen[0]).toBe(SIGNED);
    // 0x6bfa29… is keccak of these bytes; the node's answer does not get to choose it.
    expect(out.txId).toBe("0x6bfa290e4749ac903192c155d9b0f534ec9a8c8ab9dbb55bd155a91e3c0d7026");
  });

  it("reports an already-known transaction as submitted, not as an error", async () => {
    const { service } = bcHarness({ alreadyKnown: true });
    const out = (await service.broadcast(scope(), SEPOLIA, SIGNED)) as Record<string, unknown>;

    expect(out.stage).toBe("submitted");
    expect(out.alreadyKnown).toBe(true);
  });

  // The node would reject it too, but only after it has been sent — and its error would not say
  // which chain the transaction was actually built for.
  it("refuses a transaction built for another chain without submitting it", async () => {
    const { service, seen } = bcHarness();
    const SIGNED_MAINNET =
      "0x02f8700180830f42408478fbb08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c080a0bf5dda9670fd52be2346cdb74cdd238a51a4ae67ac7513fd7540fd78eca31d25a026903a9fcb8d75c83ff1e0177a8dd7061e0ddc7051500a6f1a041be1a2e32ca3";

    await expect(service.broadcast(scope(), SEPOLIA, SIGNED_MAINNET)).rejects.toMatchObject({
      code: "chain_id_mismatch",
    });
    expect(seen).toEqual([]);
  });

  it("refuses hex that is not a signed transaction", async () => {
    const { service } = bcHarness();

    await expect(service.broadcast(scope(), SEPOLIA, "0xdeadbeef")).rejects.toMatchObject({
      code: "invalid_transaction",
    });
  });
});

/**
 * `tx broadcast --dry-run`.
 *
 * The flag promises the transaction is validated and NOT submitted; on EVM it used to submit it,
 * irreversibly. The first test below is the one that matters — everything else describes what a
 * dry run is worth once it stops spending money.
 */
describe("EvmTransactionService.broadcast --dry-run", () => {
  const SIGNED =
    "0x02f87383aa36a780830f424084793b5e8282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a02958ee6a65975b5f6c2067d08704bc367375ee3fd54f1a0b4cbbc2643ab6b95ca0044e8cb5dea54b08c8b43b68a842e75e4f6627caa3911e4f9e5119ca12c01fc9";
  // What the fixture costs: nonce 0, value 1000000000000000 wei, gasLimit 21000 ×
  // maxFeePerGas 2033933954 = 42712613034000 wei. Read off the fixture, not chosen.
  const MAX_COST = 21000n * 2033933954n;
  const VALUE = 1000000000000000n;
  // The same transaction signed at nonce 5, for the gap case (ethers' own signTransaction).
  const SIGNED_NONCE_5 =
    "0x02f87383aa36a705830f4240847936a08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a0c6bd6e2d48486d0f3cfc0afe941906ed4d2b1e0ddf0d7c420ce309cb71de850da0343d3b1e4e2818e022ad953505750198158dcbd378a50046758b24aafad18c9b";

  function dryHarness(node: Partial<Record<string, unknown>> = {}) {
    const gateway = {
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
    const mainnet = { ...SEPOLIA, id: "evm:1", chainId: "1" };

    await expect(service.broadcast(scope(), mainnet as never, SIGNED, true)).rejects.toMatchObject({
      // The spec's code (§6.2/§6.3/§11); the dry run shares the guard the sign and submit paths use.
      code: "chain_id_mismatch",
    });
  });

  it("rejects a nonce the account has already spent", async () => {
    const { service, scope } = dryHarness({
      getTransactionCount: vi.fn(async () => "3"),
    });

    await expect(service.broadcast(scope(), SEPOLIA, SIGNED, true)).rejects.toMatchObject({
      code: "nonce_too_low",
    });
  });

  it("rejects a balance that cannot cover value plus the fee ceiling", async () => {
    const { service, scope } = dryHarness({
      getNativeBalance: vi.fn(async () => String(VALUE + MAX_COST - 1n)),
    });

    await expect(service.broadcast(scope(), SEPOLIA, SIGNED, true)).rejects.toMatchObject({
      code: "insufficient_balance",
    });
  });

  // A gap is not a rejection: the transaction is valid and will be mined once the missing nonce
  // arrives. Failing here would deny something that can still happen.
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

  // A dry run that cannot reach a node is still worth more than no dry run — but it must not
  // claim the checks it could not make.
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
    });
  });
});

/**
 * `tx status` and `tx info`.
 *
 * A receipt alone cannot tell "in the mempool" from "never existed" — `eth_getTransactionReceipt`
 * answers null to both — so the transaction object is read alongside it, exactly as the TRON side
 * reads getTransactionById beside getTransactionInfoById.
 */
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

  // A public endpoint may simply not keep old transactions. Reporting not_found without saying so
  // invites the reader to conclude the transaction never happened, which may be false.
  // Same field, same arithmetic as TRON's: §6.4 makes it a two-family field, not an EVM one.
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
      // seconds on the wire, as an EVM node reports them
      getBlock: vi.fn(async () => ({ timestamp: "0x66b1c0d0" })),
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

  it("reports a native transfer's parties and amount", async () => {
    const svc = infoHarness(
      { hash: HASH, from: OWNER, to: TO, value: "0xde0b6b3a7640000", input: "0x", nonce: "0x7" },
      {
        success: true,
        blockNumber: 5,
        gasUsed: "21000",
        feeWei: "1000",
        effectiveGasPriceWei: "50",
      },
    );

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({
      txid: HASH,
      from: OWNER,
      to: TO,
      amount: "1",
      symbol: "ETH",
      blockNumber: 5,
      gasUsed: "21000",
      feeWei: "1000",
      // §6.5 收斂: one case throughout, so an agent matches "success" and never "SUCCESS".
      status: "success",
      // §6.5's flat keys, out of the node objects rather than buried in the passthrough
      type: "transfer",
      nonce: 7,
      rawAmount: "1000000000000000000",
      blockTime: 1722925264,
      effectiveGasPriceWei: "50",
    });
  });

  /**
   * `type` is deliberately coarse: three words a reader can act on, and none of them requires
   * decoding calldata we have chosen not to decode (see the ERC-20 tests below).
   */
  it.each([
    [{ to: TO, input: "0x" }, "transfer"],
    [{ to: TO, input: "0xdeadbeef" }, "contract-call"],
    [{ to: null, input: "0x6080" }, "contract-creation"],
  ])("classifies %o as %s", async (fields, expected) => {
    const svc = infoHarness({ hash: HASH, from: OWNER, value: "0x0", ...fields });

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({ type: expected });
  });

  // The detail view must not fail because a second, optional read did.
  it("still answers when the block's timestamp cannot be read", async () => {
    const gateway = {
      getTransactionByHash: async () => ({
        hash: HASH,
        from: OWNER,
        to: TO,
        value: "0x0",
        input: "0x",
      }),
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

  // The ruling: decode `transfer(address,uint256)` and nothing else. Reporting the raw fields for
  // an ERC-20 transfer would name the CONTRACT as the recipient and the amount as zero.
  it("decodes an ERC-20 transfer to its real recipient and amount", async () => {
    // transfer(0xbBbB…, 5000000)
    const input = `0xa9059cbb${"0".repeat(24)}${TO.slice(2).toLowerCase()}${5000000n
      .toString(16)
      .padStart(64, "0")}`;
    const svc = infoHarness({ hash: HASH, from: OWNER, to: USDT, value: "0x0", input });

    const out = await svc.info(scope(), SEPOLIA, HASH);
    // Same field names the TRON side reports for a TRC20 transfer: contract + symbol + a human
    // amount scaled by the token's own decimals.
    expect(out).toMatchObject({
      from: OWNER,
      to: TO,
      contract: USDT,
      symbol: "USDT",
      amount: "5",
    });
  });

  it("falls back to the base-unit amount when the token's decimals are unreadable", async () => {
    const input = `0xa9059cbb${"0".repeat(24)}${TO.slice(2).toLowerCase()}${5000000n
      .toString(16)
      .padStart(64, "0")}`;
    const svc = infoHarness({ hash: HASH, from: OWNER, to: USDT, value: "0x0", input }, null, {});

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({ amount: "5000000" });
  });

  it("leaves calldata it does not recognise alone", async () => {
    const svc = infoHarness({
      hash: HASH,
      from: OWNER,
      to: USDT,
      value: "0x0",
      input: "0xdeadbeef",
    });

    const out = await svc.info(scope(), SEPOLIA, HASH);
    // still the contract, because guessing at unknown calldata is exactly what was ruled out
    expect(out.to).toBe(USDT);
    expect(out.contract).toBeUndefined();
  });

  it("refuses a hash the node has never seen", async () => {
    const svc = infoHarness(null);

    await expect(svc.info(scope(), SEPOLIA, HASH)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("EvmTransactionService.info address style", () => {
  const HASH = `0x${"ef".repeat(32)}`;
  // Nodes return addresses in lower case. Every address this CLI prints elsewhere — wallet
  // addresses, the calldata-decoded recipient below — is EIP-55, so one payload must not mix the
  // two styles: a reader comparing `from` against their own address would see a mismatch.
  it("checksums the transaction's own from and to", async () => {
    const gateway = {
      getTransactionByHash: async () => ({
        hash: HASH,
        from: "0xe4aad11792f7e74f1b5cbce65f9a1e207c952961",
        to: "0x000000000000000000000000000000000000dead",
        value: "0x0",
        input: "0x",
      }),
      getTransactionReceipt: async () => null,
      getBlockNumber: async () => "42",
      getBlock: async () => ({ timestamp: "0x66b1c0d0" }),
      getErc20Metadata: async () => ({}),
    };
    const svc = new EvmTransactionService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => [] } as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );

    const out = await svc.info(scope(), SEPOLIA, HASH);
    expect(out.from).toBe("0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961");
    expect(out.to).toBe("0x000000000000000000000000000000000000dEaD");
  });
});
