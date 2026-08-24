import { describe, expect, it, vi } from "vitest";
import type { OfflineTxSignView, Signer } from "../../../domain/types/index.js";
import {
  decodeTransactionHex,
  encodeTransactionHex,
} from "../../../adapters/outbound/chain/tron/transaction-codec.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { SignerResolver } from "../../services/signer/index.js";
import { TronSigService } from "./sig-service.js";

const A = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER_HEX = "417445076632894b7b844887d2bcd2e8c30bb6c6f2";
const TO_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const SIGNATURE = "ab".repeat(65);
const NOW = 1_900_000_000_000;
const NETWORK = { id: "tron:nile", family: "tron", nativeSymbol: "TRX" } as never;

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
    timeoutMs: 100,
    wait: false,
    waitTimeoutMs: 100,
    resolveAddress: () => A,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function setup(signerOverride?: Signer) {
  const gateway = {
    decodeTransactionHex,
    encodeTransactionHex,
    decodeTransaction: () => ({ kind: "trx", from: A, to: B, rawAmount: "1" }),
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
  return { service: new TronSigService(gateways, signers, () => NOW), signer };
}

describe("TRON artifact signing", () => {
  it("appends a signature without requiring online approval endpoints", async () => {
    const before = decodeTransactionHex(unsignedHex());
    const result: OfflineTxSignView = await setup().service.sign(scope(), NETWORK, unsignedHex());
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

  it("rejects an expired artifact before invoking the signer", async () => {
    const { service, signer } = setup();
    await expect(service.sign(scope(), NETWORK, unsignedHex(NOW))).rejects.toMatchObject({
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
    await expect(setup(signer).service.sign(scope(), NETWORK, unsignedHex())).rejects.toMatchObject(
      { code: "invalid_transaction" },
    );
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
      setup(signer).service.sign(scope(), NETWORK, unsignedHex(), { expectedSigner: A }),
    ).rejects.toMatchObject({ code: "signing_rejected" });
    expect(signer.sign).not.toHaveBeenCalled();
  });
});
