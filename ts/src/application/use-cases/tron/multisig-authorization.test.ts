import { describe, expect, it, vi } from "vitest";
import type { TronTransactionArtifact } from "../../../domain/types/index.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import { assertTronSignerAuthorized, authorizationState } from "./multisig-authorization.js";

const A = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function transaction(permissionId = 2): TronTransactionArtifact {
  return {
    txID: "ab".repeat(32),
    raw_data_hex: "00",
    raw_data: {
      expiration: 2_000_000_000_000,
      contract: [{ type: "TransferContract", Permission_id: permissionId }],
    },
  };
}

function gateway(over: Partial<TronGateway> = {}): TronGateway {
  return {
    getSignWeight: vi.fn(async () => ({
      permission: {
        id: 2,
        name: "finance",
        threshold: 2,
        operationsHex: "02" + "00".repeat(31),
        keys: [{ address: A, weight: 1 }, { address: B, weight: 1 }],
      },
      approvedList: [],
      currentWeight: 0,
      resultCode: "NOT_ENOUGH_PERMISSION",
    })),
    getApprovedList: vi.fn(async () => []),
    ...over,
  } as unknown as TronGateway;
}

describe("TRON multisig authorization preflight", () => {
  it("accepts an unused key whose active bitmap allows the transaction contract", async () => {
    await expect(assertTronSignerAuthorized(gateway(), transaction(), A, 1_900_000_000_000))
      .resolves.toBeUndefined();
  });

  it("rejects a signer outside the selected permission and a repeated signer", async () => {
    await expect(assertTronSignerAuthorized(gateway(), transaction(), "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", 1_900_000_000_000))
      .rejects.toMatchObject({ code: "not_authorized" });

    const signed = gateway({
      getSignWeight: vi.fn(async () => ({
        permission: {
          id: 2,
          name: "finance",
          threshold: 2,
          operationsHex: "02" + "00".repeat(31),
          keys: [{ address: A, weight: 1 }, { address: B, weight: 1 }],
        },
        approvedList: [A],
        currentWeight: 1,
        resultCode: "NOT_ENOUGH_PERMISSION",
      })),
      getApprovedList: vi.fn(async () => [A]),
    });
    await expect(assertTronSignerAuthorized(signed, transaction(), A, 1_900_000_000_000))
      .rejects.toMatchObject({ code: "already_signed" });
  });

  it("fails closed on a disallowed operation and inconsistent node approval state", async () => {
    const disallowed = gateway({
      getSignWeight: vi.fn(async () => ({
        permission: {
          id: 2,
          name: "vote",
          threshold: 1,
          operationsHex: "10" + "00".repeat(31),
          keys: [{ address: A, weight: 1 }],
        },
        approvedList: [],
        currentWeight: 0,
        resultCode: "NOT_ENOUGH_PERMISSION",
      })),
    });
    await expect(assertTronSignerAuthorized(disallowed, transaction(), A, 1_900_000_000_000))
      .rejects.toMatchObject({ code: "not_authorized" });

    const inconsistent = gateway({
      getApprovedList: vi.fn(async () => [A]),
    });
    await expect(authorizationState(inconsistent, transaction()))
      .rejects.toMatchObject({ code: "provider_error" });
  });

  it("rejects expired transactions before calling the node", async () => {
    const target = gateway();
    await expect(assertTronSignerAuthorized(target, transaction(), A, 2_100_000_000_000))
      .rejects.toMatchObject({ code: "tx_expired" });
    expect(target.getSignWeight).not.toHaveBeenCalled();
  });
});
