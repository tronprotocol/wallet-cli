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
import { ChainError } from "../../../domain/errors/index.js";
import type { TronMultisigService } from "./multisig-service.js";
import { TronMultisigCollaborationService } from "./multisig-collaboration-service.js";

const A = "TLZz5XKerAAebbRdScB3jmSPr5DHSpGJJP";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER_HEX = "417445076632894b7b844887d2bcd2e8c30bb6c6f2";
const TO_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const SIG = "ab".repeat(65);
const NOW = 1_900_000_000_000;
const NETWORK = { id: "tron:nile", family: "tron", nativeSymbol: "TRX", chainId: "nile" } as never;

function unsignedHex(amount = 1): string {
  return encodeTransactionHex({
    visible: false,
    raw_data: {
      contract: [
        {
          parameter: {
            value: { owner_address: OWNER_HEX, to_address: TO_HEX, amount },
            type_url: "type.googleapis.com/protocol.TransferContract",
          },
          type: "TransferContract",
          Permission_id: 2,
        },
      ],
      ref_block_bytes: "1234",
      ref_block_hash: "0011223344556677",
      timestamp: NOW,
      expiration: NOW + 86_400_000,
    },
  });
}

function remote(
  hex = unsignedHex(),
  overrides: Partial<TronLinkRemoteRecord> = {},
): TronLinkRemoteRecord {
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
      {
        address: A,
        weight: 1,
        is_sign: signed > 0 ? 1 : 0,
        sign_time: signed > 0 ? 1_900_000_001 : 0,
      },
      { address: B, weight: 1, is_sign: 0, sign_time: 0 },
    ],
    ...overrides,
  };
}

/** A record whose transaction bytes this client cannot reconstruct — as an unknown contract type
 *  or an unrecognized provider encoding would be. */
function undecodable(hex = unsignedHex()): TronLinkRemoteRecord {
  const record = remote(hex);
  return {
    ...record,
    current_transaction: { ...(record.current_transaction as object), raw_data_hex: "00" },
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
        keys: [
          { address: A, weight: 1 },
          { address: B, weight: 1 },
        ],
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

function setup(...given: TronLinkRemoteRecord[]) {
  const records = given.length ? given : [remote()];
  const collaboration = {
    list: vi.fn(async () => ({ total: records.length, records })),
    submit: vi.fn(async () => {}),
    watch: vi.fn(async (_network, _address, _signal, onMessage) => {
      onMessage([
        { state: 0, is_sign: 0 },
        { state: 0, is_sign: 1 },
      ]);
    }),
  } as unknown as TronLinkCollaborationPort;
  const chain = gateway();
  const provider = { get: vi.fn(() => chain) } as unknown as ChainGatewayProvider;
  const signedHex = encodeTransactionHex({
    ...decodeTransactionHex(unsignedHex()),
    signature: [SIG],
  });
  const local = {
    approvals: vi.fn(async (_network, hex: string) => approval(hex)),
    signChecked: vi.fn(async () => ({
      kind: "tx-sign",
      signer: A,
      signerWeight: 1,
      hex: signedHex,
      checked: true,
      transaction: {
        txId: decodeTransactionHex(signedHex).txID,
        contractType: "TransferContract",
        permissionId: 2,
        expiration: NOW + 86_400_000,
        expired: false,
        signatures: 1,
      },
      approval: approval(signedHex),
    })),
  } as unknown as TronMultisigService;
  return {
    service: new TronMultisigCollaborationService(collaboration, provider, local, () => NOW),
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
      transactions: [
        {
          txId: decodeTransactionHex(unsignedHex()).txID,
          owner: A,
          permission: { id: 2, name: "finance", threshold: 2 },
          currentWeight: 0,
          awaitingMySignature: true,
        },
      ],
    });
  });

  // A permission updated while an old transaction sat pending makes that record disagree with the
  // chain forever. Listing must survive it: one stale row cannot cost the user the whole queue.
  it("lists a chain-disagreeing record as unverified instead of failing the whole page", async () => {
    const stale = remote(unsignedHex(), { threshold: 1 });
    const signedHex = encodeTransactionHex({
      ...decodeTransactionHex(unsignedHex()),
      signature: [SIG],
    });
    const result = await setup(stale, remote(signedHex)).service.list(NETWORK, A);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ verified: false });
    expect(result.transactions[0]!.unverifiedReason).toMatch(/disagree/i);
    expect(result.transactions[1]).toMatchObject({ verified: true });
    expect(result.transactions[1]!.unverifiedReason).toBeUndefined();
  });

  // A record this client cannot reconstruct costs its own row, never the whole queue: one historical
  // transaction carrying an encoding we do not understand must not hide every pending one.
  it("omits an undecodable record and counts it instead of failing the whole page", async () => {
    const result = await setup(undecodable(), remote()).service.list(NETWORK, A);

    expect(result.unreadable).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ verified: true });
  });

  it("finds a pending record behind an undecodable one", async () => {
    const target = unsignedHex(2);
    const { service } = setup(undecodable(), remote(target));

    await expect(
      service.sign(scope(), NETWORK, decodeTransactionHex(target).txID),
    ).resolves.toMatchObject({ action: "sign", accepted: true });
  });

  // The reason belongs in the message: "TronLink sent something bad" sends the user to the wrong
  // system when the truth is that this client could not reconstruct the bytes.
  it("names why the requested record could not be decoded", async () => {
    const { service } = setup(undecodable());

    await expect(
      service.sign(scope(), NETWORK, decodeTransactionHex(unsignedHex()).txID),
    ).rejects.toMatchObject({
      code: "invalid_transaction",
      message: expect.stringMatching(/raw_data_hex does not match/),
    });
  });

  // "Could not check" is not "checked and disagreed" — a node outage must not read as a clean page.
  it("propagates a node failure rather than reporting every record as unverified", async () => {
    const { service, local } = setup();
    vi.mocked(local.approvals).mockRejectedValue(new ChainError("timeout", "node timed out"));
    await expect(service.list(NETWORK, A)).rejects.toMatchObject({ code: "timeout" });
  });

  it("still refuses to co-sign a record that disagrees with the chain", async () => {
    const { service } = setup(remote(unsignedHex(), { threshold: 1 }));
    await expect(
      service.sign(scope(), NETWORK, decodeTransactionHex(unsignedHex()).txID),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("rejects hash, owner, and progress metadata tampering", async () => {
    await expect(
      setup(remote(unsignedHex(), { hash: "00".repeat(32) })).service.list(NETWORK, A),
    ).rejects.toMatchObject({ code: "provider_error" });
    await expect(
      setup(remote(unsignedHex(), { contract_data: { owner_address: B } })).service.list(
        NETWORK,
        A,
      ),
    ).rejects.toMatchObject({ code: "provider_error" });
    await expect(
      setup(remote(unsignedHex(), { current_weight: 1 })).service.list(NETWORK, A),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("opens the collection with the originator's own signature", async () => {
    const { service, collaboration, local, signedHex } = setup();
    const context = scope();
    const result = await service.create(context, NETWORK, unsignedHex());
    expect(result).toMatchObject({
      action: "create",
      accepted: true,
      signer: A,
      signerWeight: 1,
      hex: signedHex,
      transaction: { currentWeight: 1 },
    });
    expect(local.signChecked).toHaveBeenCalledWith(context, NETWORK, unsignedHex());
    const submitted = vi.mocked(collaboration.submit).mock.calls[0]!;
    expect(submitted[1]).toBe(A);
    expect(submitted[2]).toMatchObject({
      visible: true,
      raw_data: { contract: [{ parameter: { value: { owner_address: A, to_address: B } } }] },
    });
  });

  it("refuses create artifacts that already contain a signature", async () => {
    const { service, collaboration, local, signedHex } = setup();
    await expect(service.create(scope(), NETWORK, signedHex)).rejects.toMatchObject({
      code: "invalid_value",
    });
    expect(local.signChecked).not.toHaveBeenCalled();
    expect(collaboration.submit).not.toHaveBeenCalled();
  });

  it("fetches the accumulated transaction, adds one signature, and submits it", async () => {
    const { service, collaboration, local, signedHex } = setup();
    const txId = decodeTransactionHex(unsignedHex()).txID;
    const context = scope();
    const result = await service.sign(context, NETWORK, txId);
    expect(result).toMatchObject({ action: "sign", accepted: true, hex: signedHex });
    expect(local.signChecked).toHaveBeenCalledWith(context, NETWORK, unsignedHex());
    expect(collaboration.submit).toHaveBeenCalledTimes(1);
  });

  it("reports an expired failed record as tx_expired before the generic state error", async () => {
    const expired = decodeTransactionHex(unsignedHex());
    const hex = encodeTransactionHex({
      visible: expired.visible,
      raw_data: {
        ...expired.raw_data,
        timestamp: NOW - 60_000,
        expiration: NOW - 1,
      },
    });
    const { service, local } = setup(remote(hex, { state: 2 }));

    await expect(
      service.sign(scope(), NETWORK, decodeTransactionHex(hex).txID),
    ).rejects.toMatchObject({ code: "tx_expired" });
    expect(local.signChecked).not.toHaveBeenCalled();
  });

  it("counts only pending unsigned WebSocket records", async () => {
    const { service } = setup();
    const counts: number[] = [];
    const result = await service.watch(NETWORK, A, new AbortController().signal, (count) =>
      counts.push(count),
    );
    expect(counts).toEqual([1]);
    expect(result).toMatchObject({ action: "watch", notifications: 1 });
  });
});

// #verifyOnChain used to bind only the SIGNED address set and the aggregate weight, leaving unsigned
// entries and every per-signer weight provider-controlled. A stale record (permission updated while
// the transaction sat pending) or a hostile one could therefore name a signer the permission does
// not contain, or misstate weights — and it all rendered as chain-validated.
describe("TronLink signer roster is bound to the on-chain permission", () => {
  const C = "TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2"; // not a key in the permission (keys are A and B)
  const unsigned = (address: string, weight: number) => ({
    address,
    weight,
    is_sign: 0 as const,
    sign_time: 0,
  });

  function withProgress(progress: ReturnType<typeof unsigned>[]) {
    return setup(remote(unsignedHex(), { signature_progress: progress }));
  }

  // Listing shows a fabricated roster as unverified rather than refusing the page, but it is never
  // presented as chain-validated and never as work waiting on this account.
  it("never presents a fabricated signer entry as verified", async () => {
    const { service } = withProgress([unsigned(A, 1), unsigned(B, 1), unsigned(C, 1)]);
    const view = await service.list(NETWORK, A);
    expect(view.transactions[0]).toMatchObject({ verified: false, awaitingMySignature: false });
    expect(view.transactions[0]!.unverifiedReason).toMatch(/not a key in the on-chain permission/);
  });

  it("refuses to act for an account the permission does not contain", async () => {
    const { service } = withProgress([unsigned(A, 1), unsigned(B, 1), unsigned(C, 1)]);
    // C passes every provider-side consistency check because the provider invented its own entry
    const view = await service.list(NETWORK, C);
    expect(view.transactions[0]).toMatchObject({ verified: false, awaitingMySignature: false });
    await expect(
      service.sign(scope(), NETWORK, decodeTransactionHex(unsignedHex()).txID),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("renders on-chain weights, not the ones the provider reported", async () => {
    const { service } = withProgress([unsigned(A, 1), unsigned(B, 99)]);
    const view = await service.list(NETWORK, A);
    expect(view.transactions[0]!.signatureProgress.map((entry) => entry.weight)).toEqual([1, 1]);
  });

  it("accepts a roster that omits a key — every number shown is chain-derived anyway", async () => {
    const { service } = withProgress([unsigned(A, 1)]);
    await expect(service.list(NETWORK, A)).resolves.toBeDefined();
  });
});
