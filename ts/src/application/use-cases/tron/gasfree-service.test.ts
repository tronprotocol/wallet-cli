import { describe, expect, it, vi } from "vitest";
import type { GasFreeProvider } from "../../ports/gasfree-provider.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { SignerResolver } from "../../services/signer/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type {
  NetworkDescriptor,
  SignedGasFreeAuthorization,
} from "../../../domain/types/index.js";
import { GasFreeService } from "./gasfree-service.js";

const OWNER = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const TOKEN = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const PROVIDER = "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E";
const GASFREE = "TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER";
const RECEIVER = "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT";
const DIGEST =
  "0x006c1bfb7e397bc2975949b80aa099a33a69a9b8835d84a9714723d25652f5ff";
const SIGNATURE =
  "0x580aab9832cf56d8f418711aa55653a02e51fb97a04fcd09c3bd4cd41cd376f73336a48257ca0d74bbcb8f70cc1bf6e310ca31f167a2ef8b2b93317d9f9a68e31b";
const NETWORK = {
  id: "tron:nile",
  family: "tron",
  chainId: "nile",
  aliases: ["nile"],
  capabilities: [],
  gasfree: {
    baseUrl: "https://open-test.gasfree.io",
    apiPrefix: "/nile",
    controllerChainId: "3448148188",
    verifyingContract: "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
  },
} satisfies NetworkDescriptor;

function scope(wait = false): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => OWNER,
    timeoutMs: 1000,
    wait,
    waitTimeoutMs: 1000,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function fixture(options: {
  active?: boolean;
  balance?: string;
  mismatchReceipt?: boolean;
  badDigest?: boolean;
  expiredAtSeconds?: boolean;
  terminal?: "success" | "fee-exceeded" | "mutated-recipient";
} = {}) {
  let submittedAuthorization: SignedGasFreeAuthorization | undefined;
  const submitTransfer = vi.fn(
    async (
      _network: NetworkDescriptor,
      authorization: SignedGasFreeAuthorization,
    ) => {
      submittedAuthorization = authorization;
      return {
        id: "trace-1",
        state: "WAITING" as const,
        tokenAddress: authorization.token,
        providerAddress: authorization.serviceProvider,
        accountAddress: authorization.user,
        gasFreeAddress: GASFREE,
        targetAddress: options.mismatchReceipt
          ? OWNER
          : authorization.receiver,
        amount: authorization.value,
        maxFee: authorization.maxFee,
        nonce: authorization.nonce,
        expiredAt: options.expiredAtSeconds
          ? authorization.deadline
          : `${authorization.deadline}000`,
      };
    },
  );
  const provider = {
    listTokens: vi.fn(async () => [{
      tokenAddress: TOKEN,
      activateFee: "1000000",
      transferFee: "500000",
      symbol: "USDT",
      decimals: 6,
    }]),
    listProviders: vi.fn(async () => [{
      address: PROVIDER,
      defaultDeadlineDuration: "60",
    }]),
    getAddress: vi.fn(async () => ({
      ownerAddress: OWNER,
      gasFreeAddress: GASFREE,
      active: options.active ?? false,
      nonce: "8",
      allowSubmit: true,
      assets: [{
        tokenAddress: TOKEN,
        activateFee: "1000000",
        transferFee: "500000",
      }],
    })),
    submitTransfer,
    trace: vi.fn(async () => {
      const authorization = submittedAuthorization!;
      const transferFee =
        options.terminal === "fee-exceeded" ? "1600000" : "400000";
      const activateFee = options.active ? "0" : "900000";
      const totalFee = (BigInt(transferFee) + BigInt(activateFee)).toString();
      return {
        id: "trace-1",
        state: "SUCCEED" as const,
        tokenAddress: authorization.token,
        providerAddress: authorization.serviceProvider,
        accountAddress: authorization.user,
        gasFreeAddress: GASFREE,
        targetAddress:
          options.terminal === "mutated-recipient"
            ? OWNER
            : authorization.receiver,
        amount: authorization.value,
        maxFee: authorization.maxFee,
        nonce: authorization.nonce,
        expiredAt: `${authorization.deadline}000`,
        txnHash: "ab".repeat(32),
        txnAmount: authorization.value,
        txnTransferFee: transferFee,
        txnActivateFee: activateFee,
        txnTotalFee: totalFee,
        txnTotalCost:
          (BigInt(authorization.value) + BigInt(totalFee)).toString(),
      };
    }),
  } as unknown as GasFreeProvider;
  const gateway = {
    getTokenInfo: vi.fn(async () => ({ symbol: "USDT", decimals: 6 })),
    getTrc20Balance: vi.fn(
      async () => options.balance ?? "100000000",
    ),
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
      input === "alice"
        ? { address: RECEIVER, contactName: "Alice" }
        : { address: input }
    ),
  };
  let now = 1_700_000_000_000;
  const service = new GasFreeService(
    provider,
    gateways,
    signers,
    recipients as never,
    () => now,
    async (milliseconds: number) => {
      now += milliseconds;
    },
  );
  return {
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

  it("rejects a receipt that differs from the signed authorization", async () => {
    const fixtureValue = fixture({ mismatchReceipt: true });
    await expect(
      fixtureValue.service.transfer(scope(), NETWORK, {
        to: RECEIVER,
        amount: "25",
        token: "USDT",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "gasfree_integrity" });
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
    ).rejects.toMatchObject({ code: "gasfree_integrity" });
  });
});
