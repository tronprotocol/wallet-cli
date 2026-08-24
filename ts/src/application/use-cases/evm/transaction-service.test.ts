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
    feeData: vi.fn(async () => (over.fee as object) ?? {
      baseFeeWei: "100",
      gasPriceWei: "110",
      suggestedPriorityWei: "10",
    }),
    estimateGas: vi.fn(async () => (over.gasEstimate as string) ?? "21000"),
    encodeErc20Transfer: vi.fn(() => "0xa9059cbb-encoded"),
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

  it("refuses a token transfer whose decimals it could not establish", async () => {
    const { service } = harness();

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
      ["chainId", "gasLimit", "maxFeePerGas", "maxPriorityFeePerGas", "nonce", "to", "type", "value"].sort(),
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

  it("refuses hex that is not a signed transaction", async () => {
    const { service } = bcHarness();

    await expect(service.broadcast(scope(), SEPOLIA, "0xdeadbeef")).rejects.toMatchObject({
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
  function statusHarness(tx: unknown, receipt: unknown) {
    const warn = vi.fn();
    const gateway = {
      getTransactionByHash: vi.fn(async () => tx),
      getTransactionReceipt: vi.fn(async () => receipt),
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
    const { service, scope: s } = statusHarness({ hash: HASH }, { success: false, blockNumber: 10 });

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
  function infoHarness(tx: unknown, receipt: unknown = null, meta: unknown = { symbol: "USDT", decimals: 6 }) {
    const gateway = {
      getTransactionByHash: vi.fn(async () => tx),
      getTransactionReceipt: vi.fn(async () => receipt),
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
      { hash: HASH, from: OWNER, to: TO, value: "0xde0b6b3a7640000", input: "0x" },
      { success: true, blockNumber: 5, gasUsed: "21000", feeWei: "1000" },
    );

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({
      txid: HASH,
      from: OWNER,
      to: TO,
      amount: "1",
      symbol: "ETH",
      blockNumber: 5,
      gasUsed: 21000,
      feeWei: "1000",
      status: "SUCCESS",
    });
  });

  // The ruling: decode `transfer(address,uint256)` and nothing else. Reporting the raw fields for
  // an ERC-20 transfer would name the CONTRACT as the recipient and the amount as zero.
  it("decodes an ERC-20 transfer to its real recipient and amount", async () => {
    // transfer(0xbBbB…, 5000000)
    const input = `0xa9059cbb${"0".repeat(24)}${TO.slice(2).toLowerCase()}${(5000000n)
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
    const input = `0xa9059cbb${"0".repeat(24)}${TO.slice(2).toLowerCase()}${(5000000n)
      .toString(16)
      .padStart(64, "0")}`;
    const svc = infoHarness({ hash: HASH, from: OWNER, to: USDT, value: "0x0", input }, null, {});

    await expect(svc.info(scope(), SEPOLIA, HASH)).resolves.toMatchObject({ amount: "5000000" });
  });

  it("leaves calldata it does not recognise alone", async () => {
    const svc = infoHarness({ hash: HASH, from: OWNER, to: USDT, value: "0x0", input: "0xdeadbeef" });

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
