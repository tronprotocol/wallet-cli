import { ChainError, classifyError, errorMessage } from "../../../domain/errors/index.js";
import { describe, expect, it, vi } from "vitest";
import type { SignedTx, Signer, UnsignedTx } from "../../../domain/types/index.js";
import { encodeOperations } from "../../../domain/permission/index.js";
import type { TronGateway, TronSignWeight } from "../../ports/chain/tron-gateway.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { SignerResolver } from "../../services/signer/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import {
  decodeTransactionHex,
  encodeTransactionHex,
} from "../../../adapters/outbound/chain/tron/transaction-codec.js";
import { TronMultisigService } from "./multisig-service.js";
import { TronSigService } from "./sig-service.js";
import { SigningService } from "../../services/signing/signing-service.js";

const A = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER_HEX = "417445076632894b7b844887d2bcd2e8c30bb6c6f2";
const TO_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const SIG_A = "ab".repeat(65);
const SIG_B = "cd".repeat(65);
const NOW = 1_900_000_000_000;

function unsignedHex(expiration = NOW + 60_000): string {
  return encodeTransactionHex({
    visible: false,
    raw_data: {
      contract: [
        {
          parameter: {
            value: { owner_address: OWNER_HEX, to_address: TO_HEX, amount: 1 },
            type_url: "type.googleapis.com/protocol.TransferContract",
          },
          type: "TransferContract",
          Permission_id: 2,
        },
      ],
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      timestamp: NOW,
      expiration,
    },
  });
}

function fakeGateway(overrides: Partial<TronGateway> = {}): TronGateway {
  const approvals = (transaction: unknown) => {
    const count = (transaction as { signature?: string[] }).signature?.length ?? 0;
    return count === 0 ? [] : count === 1 ? [A] : [A, B];
  };
  return {
    decodeTransactionHex,
    encodeTransactionHex,
    decodeTransaction: () => ({ kind: "trx", from: A, to: B, rawAmount: "1" }),
    getSignWeight: vi.fn(async (transaction): Promise<TronSignWeight> => ({
      permission: {
        id: 2,
        name: "active",
        threshold: 2,
        operationsHex: encodeOperations(["TransferContract"]),
        keys: [
          { address: A, weight: 1 },
          { address: B, weight: 1 },
        ],
      },
      approvedList: approvals(transaction),
      currentWeight: approvals(transaction).length,
      resultCode:
        approvals(transaction).length >= 2 ? "ENOUGH_PERMISSION" : "NOT_ENOUGH_PERMISSION",
    })),
    getApprovedList: vi.fn(async (transaction) => approvals(transaction)),
    getMultiSignFee: vi.fn(async () => 1_000_000),
    broadcastHex: vi.fn(async () => ({ txId: "txid" })),
    getTransactionInfoById: vi.fn(async () => ({})),
    referenceBlockStatus: vi.fn(async () => "held"),
    ...overrides,
  } as unknown as TronGateway;
}

function scope(): TransactionScope {
  return {
    activeAccount: "local" as never,
    timeoutMs: 100,
    wait: false,
    waitTimeoutMs: 100,
    resolveAddress: () => A,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function service(gateway: TronGateway, signer?: Signer) {
  const actualSigner: Signer = signer ?? {
    kind: "software",
    address: A,
    sign: vi.fn(async (transaction) => {
      const mutable = transaction as { signature?: string[] };
      mutable.signature = [...(mutable.signature ?? []), SIG_A];
      return transaction;
    }),
    signMessage: async () => "",
    signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
  };
  const signers = {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => actualSigner),
  } as unknown as SignerResolver;
  const provider = { get: () => gateway } as unknown as ChainGatewayProvider;
  const signing = new TronSigService(provider, signers, new SigningService(provider), () => NOW);
  return new TronMultisigService(provider, signing, () => NOW);
}

const NETWORK = { id: "tron:3448148188", family: "tron", nativeSymbol: "TRX" } as never;

describe("local TRON multi-signature workflow", () => {
  it("reports structured permission and missing weight for an unsigned transaction", async () => {
    const view = await service(fakeGateway()).approvals(NETWORK, unsignedHex());
    expect(view).toMatchObject({
      permission: { id: 2, name: "active", threshold: 2 },
      currentWeight: 0,
      missingWeight: 2,
      thresholdReached: false,
      expired: false,
      contractType: "TransferContract",
      approved: [],
    });
  });

  it("appends exactly one signature while preserving txID/raw_data and verifies its weight", async () => {
    const before = decodeTransactionHex(unsignedHex());
    const signed = await service(fakeGateway()).signChecked(scope(), NETWORK, unsignedHex());
    const after = decodeTransactionHex(signed.hex);
    expect(after.txID).toBe(before.txID);
    expect(after.raw_data_hex).toBe(before.raw_data_hex);
    expect(after.signature).toEqual([SIG_A]);
    expect(signed).toMatchObject({
      signer: A,
      signerWeight: 1,
      checked: true,
      approval: { currentWeight: 1, missingWeight: 1 },
    });
  });

  it("rejects expiration before calling a signer", async () => {
    const signer: Signer = {
      kind: "software",
      address: A,
      sign: vi.fn(async (transaction) => transaction),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    await expect(
      service(fakeGateway(), signer).signChecked(scope(), NETWORK, unsignedHex(NOW)),
    ).rejects.toMatchObject({ code: "tx_expired" });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  const spySigner = (address: string): Signer => ({
    kind: "software",
    address,
    sign: vi.fn(async (transaction) => {
      const mutable = transaction as { signature?: string[] };
      mutable.signature = [...(mutable.signature ?? []), SIG_A];
      return transaction;
    }),
    signMessage: async () => "",
    signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
  });

  it("refuses a signer outside the permission group before producing a signature", async () => {
    const outsider = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";
    const signer = spySigner(outsider);
    const scoped = { ...scope(), resolveAddress: () => outsider } as TransactionScope;
    await expect(
      service(fakeGateway(), signer).signChecked(scoped, NETWORK, unsignedHex()),
    ).rejects.toMatchObject({ code: "not_authorized" });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("refuses a repeat signature before producing a signature", async () => {
    const signer = spySigner(A);
    // The gateway maps any single signature to A, regardless of its bytes.
    const alreadySigned = encodeTransactionHex({
      ...decodeTransactionHex(unsignedHex()),
      signature: [SIG_B],
    } as never);
    await expect(
      service(fakeGateway(), signer).signChecked(scope(), NETWORK, alreadySigned),
    ).rejects.toMatchObject({ code: "already_signed" });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("does not sign when the authorized account and resolved signer diverge", async () => {
    const signer: Signer = {
      kind: "software",
      address: B,
      sign: vi.fn(async (transaction) => transaction),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    await expect(
      service(fakeGateway(), signer).signChecked(scope(), NETWORK, unsignedHex()),
    ).rejects.toMatchObject({ code: "signing_rejected" });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("requires threshold before broadcast and reports the dynamic multi-sign fee", async () => {
    const gateway = fakeGateway();
    await expect(
      service(gateway).broadcastHex(scope(), NETWORK, unsignedHex(), false),
    ).rejects.toMatchObject({ code: "not_authorized" });

    const multiSigned = encodeTransactionHex({
      ...decodeTransactionHex(unsignedHex()),
      signature: [SIG_A, SIG_B],
    });
    const dry = await service(gateway).broadcastHex(scope(), NETWORK, multiSigned, true);
    expect(dry).toMatchObject({ multiSignFeeSun: 1_000_000, mode: "dry-run" });
    expect(gateway.broadcastHex).not.toHaveBeenCalled();

    await service(gateway).broadcastHex(scope(), NETWORK, multiSigned, false);
    expect(gateway.broadcastHex).toHaveBeenCalledWith(multiSigned);
  });

  it("fails closed when the two node approval endpoints disagree", async () => {
    const gateway = fakeGateway({ getApprovedList: vi.fn(async () => [B]) });
    await expect(service(gateway).approvals(NETWORK, unsignedHex())).rejects.toMatchObject({
      code: "provider_error",
    });
  });
});

describe("TRON multisig submission outcome", () => {
  function signedHex(expiration = NOW + 60_000) {
    return encodeTransactionHex({
      ...decodeTransactionHex(unsignedHex(expiration)),
      signature: [SIG_A, SIG_B],
    });
  }

  it.each(["timeout", "rpc_error", "invalid_node_response"])(
    "retains the local ID and error representation on %s",
    async (code) => {
      const original = new ChainError(code, errorMessage`node: ${"untrusted\nvalue"}`, {
        nodeCode: "fixture",
      });
      const broadcastHex = vi.fn().mockRejectedValueOnce(original);
      const hex = signedHex();
      const error = classifyError(
        await service(fakeGateway({ broadcastHex }))
          .broadcastHex(scope(), NETWORK, hex, false)
          .catch((e) => e),
      );
      expect(error.toEnvelope()).toEqual({
        code,
        message: original.message,
        details: { nodeCode: "fixture", txId: decodeTransactionHex(hex).txID },
      });
      expect(error.textMessage).toBe(original.textMessage);
      expect(error.kind).toBe(original.kind);
      expect(error.exitCode()).toBe(original.exitCode());
      expect(broadcastHex).toHaveBeenCalledWith(hex);
    },
  );

  it("preserves a definite rejection without an ID", async () => {
    const original = new ChainError("transaction_rejected", "refused");
    const gateway = fakeGateway({ broadcastHex: vi.fn().mockRejectedValueOnce(original) });
    await expect(service(gateway).broadcastHex(scope(), NETWORK, signedHex(), false)).rejects.toBe(
      original,
    );
    expect(original.details).toBeUndefined();
  });

  it.each(["authorization", "fee"])("does not label a pre-submit %s timeout", async (step) => {
    const original = new ChainError("timeout", "before submission");
    const gateway = fakeGateway({
      [step === "authorization" ? "getSignWeight" : "getMultiSignFee"]: vi
        .fn()
        .mockRejectedValueOnce(original),
    });
    await expect(service(gateway).broadcastHex(scope(), NETWORK, signedHex(), false)).rejects.toBe(
      original,
    );
    expect(original.details).toBeUndefined();
    expect(gateway.broadcastHex).not.toHaveBeenCalled();
  });

  it.each(["expiry", "threshold", "validation"])(
    "does not attach an ID on %s failure",
    async (step) => {
      const gateway = fakeGateway();
      const hex = step === "expiry" ? signedHex(NOW) : step === "threshold" ? unsignedHex() : "00";
      const error = classifyError(
        await service(gateway)
          .broadcastHex(scope(), NETWORK, hex, false)
          .catch((e) => e),
      );
      expect(error.code).toBe(
        step === "expiry"
          ? "tx_expired"
          : step === "threshold"
            ? "not_authorized"
            : "invalid_transaction",
      );
      expect(error.details ?? {}).not.toHaveProperty("txId");
      expect(gateway.broadcastHex).not.toHaveBeenCalled();
    },
  );
});

describe("reference block check", () => {
  const signerSpy = () => ({
    kind: "software" as const,
    address: A,
    sign: vi.fn(async (transaction: UnsignedTx) => transaction as SignedTx),
    signMessage: async () => "",
    signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
  });
  const commands = {
    approvals: (svc: TronMultisigService) => svc.approvals(NETWORK, unsignedHex()),
    "tx sign": (svc: TronMultisigService) => svc.signChecked(scope(), NETWORK, unsignedHex()),
    broadcast: (svc: TronMultisigService) =>
      svc.broadcastHex(scope(), NETWORK, unsignedHex(), false),
    "broadcast --dry-run": (svc: TronMultisigService) =>
      svc.broadcastHex(scope(), NETWORK, unsignedHex(), true),
  };

  describe.each(Object.entries(commands))("%s", (_name, run) => {
    it.each([
      ["another chain's block", "different", "chain_id_mismatch"],
      ["a block the node has not reached", "not-reached", "rpc_error"],
    ] as const)(
      "refuses %s before any permission read, signature, or broadcast",
      async (_label, status, code) => {
        const gateway = fakeGateway({ referenceBlockStatus: vi.fn(async () => status) });
        const signer = signerSpy();
        await expect(run(service(gateway, signer))).rejects.toMatchObject({ code });
        expect(gateway.getSignWeight).not.toHaveBeenCalled();
        expect(gateway.getApprovedList).not.toHaveBeenCalled();
        expect(signer.sign).not.toHaveBeenCalled();
        expect(gateway.broadcastHex).not.toHaveBeenCalled();
      },
    );
  });

  it("reads permissions after a held reference block", async () => {
    const gateway = fakeGateway();
    await service(gateway).approvals(NETWORK, unsignedHex());
    const checked = (gateway.referenceBlockStatus as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    const read = (gateway.getSignWeight as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    expect(checked).toBeLessThan(read);
  });
});
