import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { decodeTransactionHex, encodeTransactionHex } from "./transaction-codec.js";

const A = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const A_HEX = "4174472e7d35395a6b5add427eecb7f4b62ad2b071";
const B_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";

afterEach(() => vi.unstubAllGlobals());

describe("TronRpcClient account permission boundary", () => {
  it("binds permission and expiration before signing, then recomputes tx identity", () => {
    const original = decodeTransactionHex(encodeTransactionHex({
      visible: false,
      raw_data: {
        contract: [{
          type: "TransferContract",
          parameter: {
            type_url: "type.googleapis.com/protocol.TransferContract",
            value: { owner_address: A_HEX, to_address: B_HEX, amount: 1 },
          },
        }],
        ref_block_bytes: "1234",
        ref_block_hash: "0011223344556677",
        timestamp: 1_900_000_000_000,
        expiration: 1_900_000_060_000,
      },
    }));
    const prepared = new TronRpcClient("https://node.invalid", 100).prepareTransaction(original, {
      permissionId: 2,
      expiration: 86_400_000,
    });
    expect(prepared.raw_data.contract[0]?.Permission_id).toBe(2);
    expect(prepared.raw_data.expiration).toBe(1_900_086_400_000);
    expect(prepared.txID).not.toBe(original.txID);
    expect(original.raw_data.contract[0]?.Permission_id).toBe(0);
    expect(original.raw_data.expiration).toBe(1_900_000_060_000);
    expect(decodeTransactionHex(encodeTransactionHex(prepared)).txID).toBe(prepared.txID);
  });

  it("normalizes node addresses and decodes active operation bitmaps", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      address: A_HEX,
      owner_permission: {
        id: 0,
        permission_name: "owner",
        threshold: 2,
        keys: [{ address: A_HEX, weight: 1 }, { address: B_HEX, weight: 1 }],
      },
      active_permission: [{
        id: 2,
        permission_name: "finance",
        threshold: 1,
        operations: "0600008000000000000000000000000000000000000000000000000000000000",
        keys: [{ address: A_HEX, weight: 1 }],
      }],
    }), { status: 200 })));

    const permissions = await new TronRpcClient("https://node.invalid", 100).getAccountPermissions(A);
    expect(permissions).toMatchObject({
      address: A,
      owner: {
        id: 0,
        threshold: 2,
        keys: [{ address: A, weight: 1, local: null }, { address: B, weight: 1, local: null }],
      },
      witness: null,
      actives: [{
        id: 2,
        name: "finance",
        operations: ["TransferContract", "TransferAssetContract", "TriggerSmartContract"],
      }],
    });
  });

  it("maps an empty account response to not_found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await expect(new TronRpcClient("https://node.invalid", 100).getAccountPermissions(A))
      .rejects.toMatchObject({ code: "not_found" });
  });

  it("materializes protocol default owner/active groups when explicit permissions are absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ address: A_HEX }), { status: 200 })));
    const permissions = await new TronRpcClient("https://node.invalid", 100).getAccountPermissions(A);
    expect(permissions).toMatchObject({
      owner: { id: 0, threshold: 1, keys: [{ address: A, weight: 1 }] },
      actives: [{ id: 2, name: "active", threshold: 1 }],
    });
    expect(permissions.actives[0]?.operations).toContain("TransferContract");
    expect(permissions.actives[0]?.operationsHex).toBe("7fff1fc0033ef30f" + "00".repeat(24));
  });

  it("fails closed on impossible node permission state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      address: A_HEX,
      owner_permission: {
        id: 0,
        permission_name: "owner",
        threshold: 2,
        keys: [{ address: A_HEX, weight: 1 }],
      },
      active_permission: [],
    }), { status: 200 })));
    await expect(new TronRpcClient("https://node.invalid", 100).getAccountPermissions(A))
      .rejects.toMatchObject({ code: "provider_error" });
  });
});
