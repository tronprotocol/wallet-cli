import { describe, expect, it, vi } from "vitest";
import type {
  TronLinkCollaborationPort,
  TronLinkRemoteRecord,
} from "../../ports/tronlink-collaboration.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import {
  decodeTransactionHex,
  encodeTransactionHex,
} from "../../../adapters/outbound/chain/tron/transaction-codec.js";
import type { TronMultisigService } from "./multisig-service.js";
import { TronLinkMultisigService } from "./tronlink-multisig-service.js";

const A = "TLZz5XKerAAebbRdScB3jmSPr5DHSpGJJP";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER_HEX = "417445076632894b7b844887d2bcd2e8c30bb6c6f2";
const TO_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const SIG = "ab".repeat(65);
const NOW = 1_900_000_000_000;
const NETWORK = { id: "tron:nile", family: "tron", chainId: "nile" } as never;

function unsignedHex(): string {
  return encodeTransactionHex({
    visible: false,
    raw_data: {
      contract: [{
        parameter: {
          value: { owner_address: OWNER_HEX, to_address: TO_HEX, amount: 1 },
          type_url: "type.googleapis.com/protocol.TransferContract",
        },
        type: "TransferContract",
        Permission_id: 2,
      }],
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      timestamp: NOW,
      expiration: NOW + 86_400_000,
    },
  });
}

function remote(hex = unsignedHex(), overrides: Partial<TronLinkRemoteRecord> = {}): TronLinkRemoteRecord {
  const transaction = decodeTransactionHex(hex);
  const signed = transaction.signature?.length ?? 0;
  return {
    hash: transaction.txID,
    contract_type: "TransferContract",
    state: 0,
    is_sign: signed > 0 ? 1 : 0,
    current_weight: signed,
    threshold: 2,
    contract_data: { owner_address: A },
    originator_address: A,
    current_transaction: transaction,
    signature_progress: [
      { address: A, weight: 1, is_sign: signed > 0 ? 1 : 0, sign_time: signed > 0 ? 1_900_000_001 : 0 },
      { address: B, weight: 1, is_sign: 0, sign_time: 0 },
    ],
    ...overrides,
  };
}

function gateway(): TronGateway {
  return {
    encodeTransactionHex,
    decodeTransactionHex,
    decodeTransaction: () => ({ kind: "trx", from: A, to: B, rawAmount: "1" }),
    getSignWeight: vi.fn(async () => ({
      permission: {
        id: 2,
        name: "finance",
        threshold: 2,
        keys: [{ address: A, weight: 1 }, { address: B, weight: 1 }],
      },
      approvedList: [],
      currentWeight: 0,
      resultCode: "NOT_ENOUGH_PERMISSION",
    })),
  } as unknown as TronGateway;
}

function scope(): TransactionScope {
  return {
    activeAccount: "local" as never,
    resolveAddress: () => A,
    timeoutMs: 1_000,
    wait: false,
    waitTimeoutMs: 1_000,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function approval(hex: string) {
  const transaction = decodeTransactionHex(hex);
  const signatures = transaction.signature?.length ?? 0;
  return {
    txId: transaction.txID,
    contractType: "TransferContract",
    permission: { id: 2, name: "finance", threshold: 2 },
    currentWeight: signatures,
    missingWeight: 2 - signatures,
    thresholdReached: signatures >= 2,
    approved: signatures ? [{ address: A, weight: 1 }] : [],
    expiration: transaction.raw_data.expiration!,
    expired: false,
    signatures,
  };
}

function setup(record = remote()) {
  const collaboration = {
    list: vi.fn(async () => ({ total: 1, records: [record] })),
    create: vi.fn(async () => {}),
    submit: vi.fn(async () => {}),
    watch: vi.fn(async (_network, _address, _signal, onMessage) => {
      onMessage([{ state: 0, is_sign: 0 }, { state: 0, is_sign: 1 }]);
    }),
  } as unknown as TronLinkCollaborationPort;
  const chain = gateway();
  const provider = { get: vi.fn(() => chain) } as unknown as ChainGatewayProvider;
  const signedHex = encodeTransactionHex({ ...decodeTransactionHex(unsignedHex()), signature: [SIG] });
  const local = {
    approvals: vi.fn(async (_network, hex: string) => approval(hex)),
    sign: vi.fn(async () => ({
      kind: "tx-sign",
      signer: A,
      signerWeight: 1,
      hex: signedHex,
      transaction: approval(signedHex),
    })),
  } as unknown as TronMultisigService;
  return {
    service: new TronLinkMultisigService(collaboration, provider, local, () => NOW),
    collaboration,
    local,
    signedHex,
  };
}

describe("TronLink multi-sign collaboration workflow", () => {
  it("projects only byte- and node-validated remote transactions", async () => {
    const result = await setup().service.list(NETWORK, A);
    expect(result).toMatchObject({
      total: 1,
      transactions: [{
        txId: decodeTransactionHex(unsignedHex()).txID,
        owner: A,
        permission: { id: 2, name: "finance", threshold: 2 },
        currentWeight: 0,
        awaitingMySignature: true,
      }],
    });
  });

  it("rejects hash, owner, and progress metadata tampering", async () => {
    await expect(setup(remote(unsignedHex(), { hash: "00".repeat(32) })).service.list(NETWORK, A))
      .rejects.toMatchObject({ code: "provider_error" });
    await expect(setup(remote(unsignedHex(), { contract_data: { owner_address: B } })).service.list(NETWORK, A))
      .rejects.toMatchObject({ code: "provider_error" });
    await expect(setup(remote(unsignedHex(), { current_weight: 1 })).service.list(NETWORK, A))
      .rejects.toMatchObject({ code: "provider_error" });
  });

  it("creates by uploading unsigned raw_data without invoking a signer", async () => {
    const { service, collaboration, local } = setup();
    const result = await service.create(NETWORK, A, unsignedHex());
    expect(result).toMatchObject({ action: "create", accepted: true, transaction: { currentWeight: 0 } });
    expect(local.sign).not.toHaveBeenCalled();
    const request = vi.mocked(collaboration.create).mock.calls[0]![2];
    expect(request).toMatchObject({
      permissionName: "finance",
      txId: decodeTransactionHex(unsignedHex()).txID,
      contractType: "TransferContract",
    });
    expect(JSON.parse(request.rawDataJson)).toMatchObject({
      contract: [{ parameter: { value: { owner_address: A, to_address: B } } }],
    });
  });

  it("refuses create artifacts that already contain a signature", async () => {
    const { service, collaboration, local, signedHex } = setup();
    await expect(service.create(NETWORK, A, signedHex))
      .rejects.toMatchObject({ code: "invalid_value" });
    expect(local.sign).not.toHaveBeenCalled();
    expect(collaboration.create).not.toHaveBeenCalled();
  });

  it("fetches the accumulated transaction, adds one signature, and submits it", async () => {
    const { service, collaboration, local, signedHex } = setup();
    const txId = decodeTransactionHex(unsignedHex()).txID;
    const context = scope();
    const result = await service.sign(context, NETWORK, txId);
    expect(result).toMatchObject({ action: "sign", accepted: true, hex: signedHex });
    expect(local.sign).toHaveBeenCalledWith(context, NETWORK, unsignedHex());
    expect(collaboration.submit).toHaveBeenCalledTimes(1);
  });

  it("counts only pending unsigned WebSocket records", async () => {
    const { service } = setup();
    const counts: number[] = [];
    const result = await service.watch(
      NETWORK,
      A,
      new AbortController().signal,
      (count) => counts.push(count),
    );
    expect(counts).toEqual([1]);
    expect(result).toMatchObject({ action: "watch", notifications: 1 });
  });
});
