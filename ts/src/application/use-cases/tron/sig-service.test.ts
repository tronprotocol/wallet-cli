import { describe, expect, it, vi } from "vitest";
import type {
  OfflineTxSignView,
  Signer,
  TronProtocolObject,
  TronTransactionArtifact,
} from "../../../domain/types/index.js";
import {
  decodeTransactionHex,
  encodeTransactionHex,
  encodeTransactionJson,
} from "../../../adapters/outbound/chain/tron/transaction-codec.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { SignerResolver } from "../../services/signer/index.js";
import { TronSigService } from "./sig-service.js";
import { SigningService } from "../../services/signing/signing-service.js";
import type { TronGateway, TronReferenceBlockStatus } from "../../ports/chain/tron/tron-gateway.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const A = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER_HEX = "417445076632894b7b844887d2bcd2e8c30bb6c6f2";
const TO_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const SIGNATURE = "ab".repeat(65);
const NOW = 1_900_000_000_000;
const NETWORK = { id: "tron:3448148188", family: "tron", nativeSymbol: "TRX" } as never;

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

function setup(signerOverride?: Signer, referenceBlock: TronReferenceBlockStatus = "held") {
  const gateway = {
    decodeTransactionHex,
    encodeTransactionHex,
    encodeTransactionJson,
    decodeTransaction: () => ({ kind: "trx", from: A, to: B, rawAmount: "1" }),
    referenceBlockStatus: vi.fn(async () => referenceBlock),
  } as unknown as TronGateway;
  const signer =
    signerOverride ??
    ({
      kind: "software",
      address: A,
      sign: vi.fn(async (transaction) => ({
        ...transaction,
        signature: [...(transaction.signature ?? []), SIGNATURE],
      })),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    } as Signer);
  const signers = {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => signer),
  } as unknown as SignerResolver;
  const gateways = { get: vi.fn(() => gateway) } as unknown as ChainGatewayProvider;
  const artifacts = { write: vi.fn() };
  return {
    service: new TronSigService(
      gateways,
      signers,
      new SigningService(gateways),
      artifacts,
      () => NOW,
    ),
    signer,
    gateway,
    artifacts,
  };
}

describe("TRON artifact signing", () => {
  it("appends a signature without requiring online approval endpoints", async () => {
    const before = decodeTransactionHex(unsignedHex());
    const result: OfflineTxSignView = await setup().service.sign(scope(), NETWORK, unsignedHex(), {
      origin: "offline",
    });
    const after = decodeTransactionHex(result.hex);

    expect(after.txID).toBe(before.txID);
    expect(after.raw_data_hex).toBe(before.raw_data_hex);
    expect(after.signature).toEqual([SIGNATURE]);
    expect(result).toMatchObject({
      kind: "tx-sign",
      checked: false,
      signer: A,
      transaction: {
        permissionId: 2,
        signatures: 1,
        contractType: "TransferContract",
      },
    });
  });

  it("writes the signed hex to the chosen file and reports it", async () => {
    const { service, artifacts } = setup();
    const result = await service.sign(
      scope(),
      NETWORK,
      unsignedHex(),
      { origin: "offline" },
      "signed.hex",
    );
    expect(artifacts.write).toHaveBeenCalledExactlyOnceWith("signed.hex", result.hex);
    expect(result.out).toBe("signed.hex");
  });

  it("writes nothing when no file is chosen or signing fails", async () => {
    const { service, artifacts } = setup();
    const result = await service.sign(scope(), NETWORK, unsignedHex(), { origin: "offline" });
    expect(result).not.toHaveProperty("out");
    await expect(
      service.sign(scope(), NETWORK, unsignedHex(NOW), { origin: "offline" }, "signed.hex"),
    ).rejects.toMatchObject({ code: "tx_expired" });
    expect(artifacts.write).not.toHaveBeenCalled();
  });

  it("rejects an expired artifact before invoking the signer", async () => {
    const { service, signer } = setup();
    await expect(
      service.sign(scope(), NETWORK, unsignedHex(NOW), { origin: "offline" }),
    ).rejects.toMatchObject({
      code: "tx_expired",
    });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("rejects a signer that changes raw_data instead of only appending a signature", async () => {
    const signer = {
      kind: "software",
      address: A,
      sign: vi.fn(async (transaction) => ({
        ...transaction,
        txID: "ff".repeat(32),
        signature: [SIGNATURE],
      })),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    } as Signer;
    await expect(
      setup(signer).service.sign(scope(), NETWORK, unsignedHex(), { origin: "offline" }),
    ).rejects.toMatchObject({ code: "invalid_transaction" });
  });

  it("rejects an unexpected signer before asking it to sign", async () => {
    const signer = {
      kind: "software",
      address: B,
      sign: vi.fn(async (transaction) => transaction),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    } as Signer;
    await expect(
      setup(signer).service.sign(scope(), NETWORK, unsignedHex(), {
        origin: "offline",
        expectedSigner: A,
      }),
    ).rejects.toMatchObject({ code: "signing_rejected" });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("warns that an offline signature did not verify the network", async () => {
    const { service, gateway } = setup();
    const s = scope();
    await service.sign(s, NETWORK, unsignedHex(), { origin: "offline" });
    expect(gateway.referenceBlockStatus).not.toHaveBeenCalled();
    expect(s.warn).toHaveBeenCalledWith(expect.objectContaining({ code: "network_not_verified" }));
  });

  it("signs an imported artifact whose reference block the node holds", async () => {
    const { service, gateway, signer } = setup();
    const s = scope();
    await service.sign(s, NETWORK, unsignedHex(), { origin: "imported" });
    expect(gateway.referenceBlockStatus).toHaveBeenCalledOnce();
    expect(signer.sign).toHaveBeenCalledOnce();
    expect(s.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["different", "chain_id_mismatch"],
    ["not-reached", "rpc_error"],
  ] as const)(
    "refuses an imported artifact whose reference block is %s before the signer runs",
    async (status, code) => {
      const { service, signer } = setup(undefined, status);
      await expect(
        service.sign(scope(), NETWORK, unsignedHex(), { origin: "imported" }),
      ).rejects.toMatchObject({ code });
      expect(signer.sign).not.toHaveBeenCalled();
    },
  );
});

describe("TRON JSON artifact signing", () => {
  // The decoded artifact as the caller's parsed JSON.
  const json = (expiration?: number) =>
    decodeTransactionHex(unsignedHex(expiration)) as TronTransactionArtifact & TronProtocolObject;
  const signerReturning = (sign: Signer["sign"]) =>
    ({
      kind: "software",
      address: A,
      sign: vi.fn(sign),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    }) as Signer;

  it("signs the caller's object and returns the sign-only shape", async () => {
    const { service, signer } = setup();
    const transaction = json();
    const s = scope();
    const result = await service.signJson(s, NETWORK, transaction, { origin: "offline" });

    expect(signer.sign).toHaveBeenCalledWith(transaction, {});
    expect(result).toEqual({
      kind: "sign",
      mode: "sign-only",
      signed: { ...transaction, signature: [SIGNATURE] },
      address: A,
      txId: transaction.txID,
    });
    expect(s.warn).toHaveBeenCalledWith(expect.objectContaining({ code: "network_not_verified" }));
  });

  it("rejects an expired transaction before invoking the signer", async () => {
    const { service, signer } = setup();
    await expect(
      service.signJson(scope(), NETWORK, json(NOW), { origin: "offline" }),
    ).rejects.toMatchObject({ code: "tx_expired" });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("rejects JSON whose raw_data disagrees with raw_data_hex", async () => {
    const { service, signer } = setup();
    const transaction = json();
    transaction.raw_data.expiration = NOW + 120_000;
    await expect(
      service.signJson(scope(), NETWORK, transaction, { origin: "offline" }),
    ).rejects.toMatchObject({ code: "invalid_transaction" });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("rejects a signer that changes the transaction", async () => {
    const signer = signerReturning(
      async (transaction) =>
        ({
          ...(transaction as object),
          txID: "ff".repeat(32),
          signature: [SIGNATURE],
        }) as never,
    );
    await expect(
      setup(signer).service.signJson(scope(), NETWORK, json(), { origin: "offline" }),
    ).rejects.toMatchObject({ code: "invalid_transaction" });
  });

  it("rejects a signer that does not add exactly one signature", async () => {
    const signer = signerReturning(
      async (transaction) =>
        ({
          ...(transaction as object),
          signature: [SIGNATURE, SIGNATURE],
        }) as never,
    );
    await expect(
      setup(signer).service.signJson(scope(), NETWORK, json(), { origin: "offline" }),
    ).rejects.toMatchObject({ code: "signing_rejected" });
  });
});
