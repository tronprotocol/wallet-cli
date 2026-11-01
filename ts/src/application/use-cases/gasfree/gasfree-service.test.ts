import type { DispatchCheck } from "../../contracts/deadline.js";
import { describe, expect, it, vi } from "vitest";
import { ChainError, TransportError } from "../../../domain/errors/index.js";
import type { GasFreeProvider } from "../../ports/gasfree-provider.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { SignerResolver } from "../../services/signer/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { NetworkDescriptor, SignedGasFreeAuthorization } from "../../../domain/types/index.js";
import { GasFreeService } from "./gasfree-service.js";
import { SigningService } from "../../services/signing/signing-service.js";
import { cliMessage } from "../../../adapters/inbound/cli/output/errors.js";
import { CommandDeadline, type MonotonicClock } from "../../services/command-deadline.js";
import { DeadlineExpiredError } from "../../contracts/deadline.js";

const cliWarnings = (ctx: TransactionScope) =>
  vi
    .mocked(ctx.warn)
    .mock.calls.map(([message]) =>
      typeof message === "string" || "code" in message ? message : cliMessage(message).message,
    );

const OWNER = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const TOKEN = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const PROVIDER = "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E";
const GASFREE = "TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER";
const RECEIVER = "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT";
const DIGEST = "0x006c1bfb7e397bc2975949b80aa099a33a69a9b8835d84a9714723d25652f5ff";
const SIGNATURE =
  "0x580aab9832cf56d8f418711aa55653a02e51fb97a04fcd09c3bd4cd41cd376f73336a48257ca0d74bbcb8f70cc1bf6e310ca31f167a2ef8b2b93317d9f9a68e31b";
const NETWORK = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "3448148188",
  capabilities: [],
  gasfree: {
    baseUrl: "https://open-test.gasfree.io",
    apiPrefix: "/nile",
    controllerChainId: "3448148188",
    verifyingContract: "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
  },
} satisfies NetworkDescriptor;

// The deadline follows the fixture's clock, which the fixture's sleep advances.
function scope(wait = false, limitMs = 0, clock?: MonotonicClock): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => OWNER,
    deadline: new CommandDeadline(limitMs, clock?.now(), clock),
    wait,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function fixture(
  options: {
    active?: boolean;
    balance?: string;
    mismatchReceipt?: boolean;
    badDigest?: boolean;
    terminal?: "success" | "fee-exceeded" | "mutated-recipient";
    trace?: (call: number) => Promise<unknown>;
  } = {},
) {
  let submittedAuthorization: SignedGasFreeAuthorization | undefined;
  let traceCalls = 0;
  const submitTransfer = vi.fn(
    async (_network: NetworkDescriptor, authorization: SignedGasFreeAuthorization) => {
      submittedAuthorization = authorization;
      return {
        id: "trace-1",
        state: "WAITING" as const,
        tokenAddress: authorization.token,
        providerAddress: authorization.serviceProvider,
        accountAddress: authorization.user,
        gasFreeAddress: GASFREE,
        targetAddress: options.mismatchReceipt ? OWNER : authorization.receiver,
        amount: authorization.value,
        maxFee: authorization.maxFee,
        nonce: authorization.nonce,
        expiredAt: `${authorization.deadline}000`,
      };
    },
  );
  const provider = {
    listTokens: vi.fn(async () => [
      {
        tokenAddress: TOKEN,
        activateFee: "1000000",
        transferFee: "500000",
        symbol: "USDT",
        decimals: 6,
      },
    ]),
    listProviders: vi.fn(async () => [
      {
        address: PROVIDER,
        defaultDeadlineDuration: "60",
      },
    ]),
    getAddress: vi.fn(async () => ({
      ownerAddress: OWNER,
      gasFreeAddress: GASFREE,
      active: options.active ?? false,
      nonce: "8",
      allowSubmit: true,
      assets: [
        {
          tokenAddress: TOKEN,
          activateFee: "1000000",
          transferFee: "500000",
        },
      ],
    })),
    submitTransfer,
    trace: vi.fn(async () => {
      if (options.trace) return options.trace(++traceCalls);
      const authorization = submittedAuthorization!;
      const transferFee = options.terminal === "fee-exceeded" ? "1600000" : "400000";
      const activateFee = options.active ? "0" : "900000";
      const totalFee = (BigInt(transferFee) + BigInt(activateFee)).toString();
      return {
        id: "trace-1",
        state: "SUCCEED" as const,
        tokenAddress: authorization.token,
        providerAddress: authorization.serviceProvider,
        accountAddress: authorization.user,
        gasFreeAddress: GASFREE,
        targetAddress: options.terminal === "mutated-recipient" ? OWNER : authorization.receiver,
        amount: authorization.value,
        maxFee: authorization.maxFee,
        nonce: authorization.nonce,
        expiredAt: `${authorization.deadline}000`,
        txnHash: "ab".repeat(32),
        txnAmount: authorization.value,
        txnTransferFee: transferFee,
        txnActivateFee: activateFee,
        txnTotalFee: totalFee,
        txnTotalCost: (BigInt(authorization.value) + BigInt(totalFee)).toString(),
      };
    }),
  } as unknown as GasFreeProvider;
  const gateway = {
    getTokenInfo: vi.fn(async () => ({ symbol: "USDT", decimals: 6 })),
    getTrc20Balance: vi.fn(async () => options.balance ?? "100000000"),
  };
  const gateways = {
    get: () => gateway,
  } as unknown as ChainGatewayProvider;
  const signer = {
    kind: "software" as const,
    address: OWNER,
    sign: vi.fn(),
    signMessage: vi.fn(),
    signTypedData: vi.fn(async () => ({
      signature: SIGNATURE,
      digest: options.badDigest ? `0x${"00".repeat(32)}` : DIGEST,
      primaryType: "PermitTransfer",
    })),
  };
  const signers = {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => signer),
  } as unknown as SignerResolver;
  const recipients = {
    resolve: vi.fn((_family: string, input: string) =>
      input === "alice" ? { address: RECEIVER, contactName: "Alice" } : { address: input },
    ),
  };
  let now = 1_700_000_000_000;
  const service = new GasFreeService(
    provider,
    gateways,
    signers,
    new SigningService(gateways as never),
    recipients as never,
    () => now,
    async (milliseconds: number) => {
      now += milliseconds;
    },
  );
  return {
    clock: { now: () => now },
    service,
    provider,
    submitTransfer,
    signer,
    signers,
    recipients,
  };
}

describe("GasFreeService", () => {
  it("dry-run checks the complete first-transfer cost without signing", async () => {
    const fixtureValue = fixture({ active: false });
    const result = await fixtureValue.service.transfer(scope(), NETWORK, {
      to: RECEIVER,
      amount: "25",
      token: "USDT",
      dryRun: true,
    });
    expect(result).toMatchObject({
      stage: "dry-run",
      amount: "25000000",
      serviceFee: "500000",
      activateFee: "1000000",
      authorizedMaxFee: "1500000",
      totalDeducted: "26500000",
      nonce: "8",
      deadline: "1700000060",
    });
    expect(fixtureValue.signers.assertCanSign).not.toHaveBeenCalled();
    expect(fixtureValue.signer.signTypedData).not.toHaveBeenCalled();
    expect(fixtureValue.submitTransfer).not.toHaveBeenCalled();
  });

  it("resolves a contact before signing and binds its address into TIP-712", async () => {
    const fixtureValue = fixture({ active: true });
    const result = await fixtureValue.service.transfer(scope(), NETWORK, {
      to: "alice",
      amount: "25",
      token: "USDT",
      dryRun: false,
    });

    expect(result).toMatchObject({
      to: RECEIVER,
      toContact: "Alice",
    });
    expect(fixtureValue.submitTransfer).toHaveBeenCalledWith(
      NETWORK,
      expect.objectContaining({ receiver: RECEIVER }),
      expect.anything(),
    );
  });

  it("signs the exact TIP-712 digest and accepts Java millisecond expiry", async () => {
    const fixtureValue = fixture({ active: true });
    const result = await fixtureValue.service.transfer(scope(), NETWORK, {
      to: RECEIVER,
      amount: "25",
      token: "USDT",
      dryRun: false,
    });
    expect(result).toMatchObject({
      stage: "submitted",
      traceId: "trace-1",
      activateFee: "0",
      totalDeducted: "25500000",
    });
    expect(fixtureValue.signer.signTypedData).toHaveBeenCalledOnce();
    expect(fixtureValue.submitTransfer).toHaveBeenCalledWith(
      NETWORK,
      expect.objectContaining({ sig: SIGNATURE.slice(2) }),
      expect.anything(),
    );
  });

  it("rejects a signer-reported digest mismatch before submission", async () => {
    const fixtureValue = fixture({ badDigest: true });
    await expect(
      fixtureValue.service.transfer(scope(), NETWORK, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "signing_rejected" });
    expect(fixtureValue.submitTransfer).not.toHaveBeenCalled();
  });

  it("refuses a controller chain id that is not the network's chain before signing", async () => {
    const fixtureValue = fixture({ active: true });
    const network = {
      ...NETWORK,
      gasfree: { ...NETWORK.gasfree, controllerChainId: "728126428" },
    };
    await expect(
      fixtureValue.service.transfer(scope(), network, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "chain_id_mismatch" });
    expect(fixtureValue.signer.signTypedData).not.toHaveBeenCalled();
    expect(fixtureValue.submitTransfer).not.toHaveBeenCalled();
  });

  it("rejects a receipt that differs from the signed authorization and keeps its trace id", async () => {
    const fixtureValue = fixture({ mismatchReceipt: true });
    await expect(
      fixtureValue.service.transfer(scope(), NETWORK, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "gasfree_integrity", details: { traceId: "trace-1" } });
  });

  it("fails before signing when the balance cannot cover amount plus fees", async () => {
    const fixtureValue = fixture({ balance: "100" });
    await expect(
      fixtureValue.service.transfer(scope(), NETWORK, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "insufficient_token_balance" });
    expect(fixtureValue.signer.signTypedData).not.toHaveBeenCalled();
  });

  it("revalidates the polled record and returns final charged fees", async () => {
    const fixtureValue = fixture({
      active: false,
      terminal: "success",
    });
    const result = await fixtureValue.service.transfer(scope(true), NETWORK, {
      to: RECEIVER,
      amount: "25",
      token: "USDT",
      dryRun: false,
    });
    expect(result).toMatchObject({
      stage: "confirmed",
      state: "SUCCEED",
      txId: "ab".repeat(32),
      serviceFee: "400000",
      activateFee: "900000",
      totalDeducted: "26300000",
    });
  });

  it("rejects a final provider fee above the signed maxFee", async () => {
    const fixtureValue = fixture({
      active: true,
      terminal: "fee-exceeded",
    });
    await expect(
      fixtureValue.service.transfer(scope(true), NETWORK, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "gasfree_integrity" });
  });

  it("rejects signed transfer fields that mutate while polling", async () => {
    const fixtureValue = fixture({ terminal: "mutated-recipient" });
    await expect(
      fixtureValue.service.transfer(scope(true), NETWORK, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "gasfree_integrity", details: { traceId: "trace-1" } });
  });

  describe("--wait polling failures never destroy the receipt", () => {
    const send = (fixtureValue: ReturnType<typeof fixture>, ctx: TransactionScope) =>
      fixtureValue.service.transfer(ctx, NETWORK, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      });

    function terminalRecord(state: "SUCCEED") {
      return {
        id: "trace-1",
        state,
        tokenAddress: TOKEN,
        providerAddress: PROVIDER,
        accountAddress: OWNER,
        gasFreeAddress: GASFREE,
        targetAddress: RECEIVER,
        amount: "25000000",
        maxFee: "1500000",
        nonce: "8",
        txnHash: "ab".repeat(32),
      };
    }

    it("retries transport flakiness inside the deadline and still settles", async () => {
      const fixtureValue = fixture({
        active: true,
        trace: async (call) => {
          if (call === 1)
            throw new TransportError("provider_error", "GasFree service returned HTTP 503");
          if (call === 2) throw new ChainError("timeout", "GasFree request timed out after 1000ms");
          return terminalRecord("SUCCEED");
        },
      });
      const ctx = scope(true, 5000, fixtureValue.clock);

      const result = await send(fixtureValue, ctx);

      expect(fixtureValue.provider.trace).toHaveBeenCalledTimes(3);
      expect(result).toMatchObject({ stage: "confirmed", state: "SUCCEED", traceId: "trace-1" });
    });

    it("returns the submitted receipt when flakiness outlasts the deadline", async () => {
      const fixtureValue = fixture({
        active: true,
        trace: async () => {
          throw new TransportError("provider_error", "GasFree service rate limit exceeded");
        },
      });
      const ctx = scope(true, 3000, fixtureValue.clock);

      const result = await send(fixtureValue, ctx);

      expect(result).toMatchObject({ stage: "submitted", state: "WAITING", traceId: "trace-1" });
      expect(cliWarnings(ctx)).toEqual([
        "--wait: GasFree transfer trace-1 did not finish before the command's time limit; returning submitted",
      ]);
    });

    it("gives up on a non-retryable provider error but keeps the trace id", async () => {
      const fixtureValue = fixture({
        active: true,
        trace: async () => {
          throw new ChainError("gasfree_rejected", "GasFree service returned HTTP 404");
        },
      });
      const ctx = scope(true, 5000, fixtureValue.clock);

      const result = await send(fixtureValue, ctx);

      expect(result).toMatchObject({ stage: "submitted", traceId: "trace-1" });
      expect(fixtureValue.provider.trace).toHaveBeenCalledTimes(1);
      expect(cliWarnings(ctx)).toEqual([
        "--wait: GasFree trace could not be polled (gasfree_rejected); returning submitted — reconcile with `gasfree trace trace-1`",
      ]);
    });

    it("passes the deadline check to each trace and sends none after expiry", async () => {
      const checks: DispatchCheck[] = [];
      const fixtureValue = fixture({ active: true });
      vi.mocked(fixtureValue.provider.trace).mockImplementation(async (_network, _id, check) => {
        checks.push(check);
        throw new ChainError("timeout", "GasFree request exceeded the wait time");
      });
      const ctx = scope(true, 2500, fixtureValue.clock);

      const result = await send(fixtureValue, ctx);

      // Traces after the 1000 ms and 2000 ms poll intervals; the next interval reaches the deadline.
      expect(checks).toHaveLength(2);
      expect(checks[0]!.signal).toBe(ctx.deadline.signal);
      expect(result).toMatchObject({ stage: "submitted", traceId: "trace-1" });
      expect(cliWarnings(ctx)[0]).toContain("did not finish before the command's time limit");
    });
  });
});

describe("GasFree submit under the command deadline", () => {
  const send = (fixtureValue: ReturnType<typeof fixture>, ctx: TransactionScope) =>
    fixtureValue.service.transfer(ctx, NETWORK, {
      to: RECEIVER,
      amount: "25",
      token: "USDT",
      dryRun: false,
    });

  it("refuses the submit below the admission reserve and sends nothing", async () => {
    const fixtureValue = fixture({ active: true });
    const ctx = scope(false, 1999, fixtureValue.clock);

    await expect(send(fixtureValue, ctx)).rejects.toSatisfy(
      (error) => error instanceof DeadlineExpiredError && !("details" in error && error.details),
    );
    expect(fixtureValue.submitTransfer).not.toHaveBeenCalled();
  });

  it("keeps the authorization evidence, but no signature, when the submit reply is lost", async () => {
    const fixtureValue = fixture({ active: true });
    fixtureValue.submitTransfer.mockRejectedValueOnce(
      new ChainError("timeout", "GasFree request did not finish in time"),
    );

    const error = await send(fixtureValue, scope()).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "timeout",
      message: expect.stringContaining("no trace id is known"),
      details: {
        paymentStatus: "unknown",
        retryPayment: false,
        network: NETWORK.id,
        serviceProvider: PROVIDER,
        owner: OWNER,
        from: GASFREE,
        to: RECEIVER,
        token: "USDT",
        tokenAddress: TOKEN,
        amount: "25000000",
        authorizedMaxFee: "1500000",
        nonce: "8",
        deadline: expect.stringMatching(/^\d+$/),
        permitDigest: DIGEST,
      },
    });
    const details = (error as ChainError).details as Record<string, unknown>;
    expect(details).not.toHaveProperty("traceId");
    expect(JSON.stringify(details)).not.toContain(SIGNATURE.slice(2, 40));
  });

  it("reports an unreadable submit reply as an unknown provider outcome", async () => {
    const fixtureValue = fixture({ active: true });
    fixtureValue.submitTransfer.mockRejectedValueOnce(
      new TransportError("provider_error", "GasFree service returned HTTP 502"),
    );

    await expect(send(fixtureValue, scope())).rejects.toMatchObject({
      code: "provider_error",
      details: { paymentStatus: "unknown", retryPayment: false, nonce: "8" },
    });
  });

  it("keeps a stated provider refusal and a pre-dispatch refusal unchanged", async () => {
    const rejected = new ChainError("gasfree_rejected", "GasFree service rejected the request");
    const refused = new DeadlineExpiredError();
    for (const failure of [rejected, refused]) {
      const fixtureValue = fixture({ active: true });
      fixtureValue.submitTransfer.mockRejectedValueOnce(failure);
      await expect(send(fixtureValue, scope())).rejects.toBe(failure);
    }
  });

  it("returns the submitted receipt with its trace id when the deadline ends the trace wait", async () => {
    const fixtureValue = fixture({
      active: true,
      trace: async () => new Promise<never>(() => {}),
    });
    const service = new GasFreeService(
      fixtureValue.provider,
      {
        get: () => ({
          getTokenInfo: async () => ({ symbol: "USDT", decimals: 6 }),
          getTrc20Balance: async () => "100000000",
        }),
      } as unknown as ChainGatewayProvider,
      fixtureValue.signers,
      new SigningService({} as never),
      fixtureValue.recipients as never,
      () => 1_700_000_000_000,
    );
    vi.mocked(fixtureValue.provider.trace).mockImplementation(
      (_network, _id, check) =>
        new Promise((_resolve, reject) =>
          check.signal.addEventListener("abort", () => reject(new ChainError("timeout", "late"))),
        ),
    );
    const ctx = scope(true, 2100);

    const started = performance.now();
    const result = await service.transfer(ctx, NETWORK, {
      to: RECEIVER,
      amount: "25",
      token: "USDT",
      dryRun: false,
    });

    expect(result).toMatchObject({ stage: "submitted", traceId: "trace-1" });
    expect(performance.now() - started).toBeLessThan(2600);
    expect(cliWarnings(ctx)[0]).toContain("did not finish before the command's time limit");
  });
});
