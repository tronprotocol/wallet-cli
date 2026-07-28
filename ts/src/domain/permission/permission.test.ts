import { describe, expect, it } from "vitest";
import type { AccountDescriptor } from "../types/index.js";
import {
  annotateLocalPermissionKeys,
  buildLocalPermissionInventory,
  decodeOperations,
  encodeOperations,
  permissionSafetyWarnings,
  validatePermissionStructure,
} from "./index.js";

const A = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const B = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const C = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

function structure() {
  return {
    address: A,
    owner: {
      id: 0,
      threshold: 2,
      keys: [{ address: A, weight: 1, local: "forged" }, { address: B, weight: 1 }],
    },
    witness: null,
    actives: [{
      id: 2,
      name: "finance",
      threshold: 1,
      operations: ["TransferContract", "TransferAssetContract", "TriggerSmartContract"],
      operationsHex: "0600008000000000000000000000000000000000000000000000000000000000",
      unknownOperationIds: [] as number[],
      keys: [{ address: A, weight: 1 }],
    }],
  };
}

describe("TRON permission operations", () => {
  it("uses contract ids as little-endian bits within a fixed 32-byte bitmap", () => {
    const encoded = encodeOperations(["TransferContract", "TransferAssetContract", "TriggerSmartContract"]);
    expect(encoded).toBe("0600008000000000000000000000000000000000000000000000000000000000");
    expect(decodeOperations(encoded)).toMatchObject({
      operations: ["TransferContract", "TransferAssetContract", "TriggerSmartContract"],
      labels: ["Transfer TRX", "Transfer TRC10", "Trigger Smart Contract"],
      unknownOperationIds: [],
    });
  });

  it("names every operation enabled by the protocol default bitmap", () => {
    const decoded = decodeOperations("7fff1fc0033ef30f" + "00".repeat(24));
    expect(decoded.operations).toContain("VoteAssetContract");
    expect(decoded.operations).toContain("CustomContract");
    expect(decoded.operations).toContain("GetContract");
    expect(decoded.unknownOperationIds).toEqual([]);
  });

  it("recognizes shielded transfer even though the current default bitmap excludes it", () => {
    const decoded = decodeOperations("00".repeat(6) + "08" + "00".repeat(25));
    expect(decoded.operations).toEqual(["ShieldedTransferContract"]);
    expect(decoded.unknownOperationIds).toEqual([]);
  });

  it("preserves genuinely unknown set bits when reading node state", () => {
    const decoded = decodeOperations("80" + "00".repeat(31));
    expect(decoded.operations).toEqual([]);
    expect(decoded.unknownOperationIds).toEqual([7]);
  });

  it("rejects unknown contract names and malformed bitmaps", () => {
    expect(() => encodeOperations(["FutureContract"])).toThrowError(/unknown TRON contract/);
    expect(() => decodeOperations("00")).toThrowError(/exactly 32 bytes/);
  });
});

describe("permission replacement validation", () => {
  it("canonicalizes a valid structure and ignores forged local labels", () => {
    const parsed = validatePermissionStructure(structure());
    expect(parsed.owner.keys[0]?.local).toBeNull();
    expect(parsed.owner.name).toBe("owner");
    expect(parsed.actives[0]?.operationLabels).toContain("Transfer TRX");
  });

  it("round-trips unknown operation bits when the known operation list matches", () => {
    const input = structure();
    input.actives[0]!.operationsHex = "86000080" + "00".repeat(28);
    input.actives[0]!.unknownOperationIds = [7];
    const parsed = validatePermissionStructure(input);
    expect(parsed.actives[0]).toMatchObject({
      operations: ["TransferContract", "TransferAssetContract", "TriggerSmartContract"],
      operationsHex: input.actives[0]!.operationsHex,
      unknownOperationIds: [7],
    });
  });

  // The bitmap is what the chain enforces; `operations` and `unknownOperationIds` are what a human
  // reviews. A bit set in the bitmap but absent from both lists would widen the permission with
  // nothing in the file to show for it — exactly how the original round-trip bug hid its damage.
  it("rejects unnamed operation bits that the file does not declare", () => {
    const omitted = structure();
    omitted.actives[0]!.operationsHex = "86000080" + "00".repeat(28);
    delete (omitted.actives[0] as Record<string, unknown>).unknownOperationIds;
    expect(() => validatePermissionStructure(omitted)).toThrowError(/must declare the unnamed contract types.*7/);

    const emptied = structure();
    emptied.actives[0]!.operationsHex = "86000080" + "00".repeat(28);
    expect(() => validatePermissionStructure(emptied)).toThrowError(/declared none, bitmap sets 7/);
  });

  it("rejects unknownOperationIds that disagree with the bitmap", () => {
    const understated = structure();
    understated.actives[0]!.operationsHex = "86000088" + "00".repeat(28);
    understated.actives[0]!.unknownOperationIds = [7];
    expect(() => validatePermissionStructure(understated)).toThrowError(/does not match operationsHex/);

    const overstated = structure();
    overstated.actives[0]!.unknownOperationIds = [7];
    expect(() => validatePermissionStructure(overstated)).toThrowError(/does not match operationsHex/);
  });

  it("rejects duplicate unknownOperationIds", () => {
    const input = structure();
    input.actives[0]!.operationsHex = "86000080" + "00".repeat(28);
    input.actives[0]!.unknownOperationIds = [7, 7];
    expect(() => validatePermissionStructure(input)).toThrowError(/must not contain duplicate/);
  });

  it("rejects unknownOperationIds without a bitmap to justify them", () => {
    const input = structure();
    delete (input.actives[0] as Record<string, unknown>).operationsHex;
    input.actives[0]!.unknownOperationIds = [7];
    expect(() => validatePermissionStructure(input)).toThrowError(/requires operationsHex/);

    const malformed = structure();
    delete (malformed.actives[0] as Record<string, unknown>).operationsHex;
    (malformed.actives[0] as Record<string, unknown>).unknownOperationIds = "3";
    expect(() => validatePermissionStructure(malformed)).toThrowError(/requires operationsHex/);
  });

  // A node permission may set only bits this build cannot name; `permission show` then emits
  // operations: []. Rejecting that would leave such an account unable to restore its own backup.
  it("accepts an active whose bitmap holds only unnamed contract types", () => {
    const input = structure();
    input.actives[0]!.operations = [];
    input.actives[0]!.operationsHex = "80" + "00".repeat(31);
    input.actives[0]!.unknownOperationIds = [7];
    const parsed = validatePermissionStructure(input);
    expect(parsed.actives[0]).toMatchObject({
      operations: [],
      operationsHex: "80" + "00".repeat(31),
      unknownOperationIds: [7],
    });
  });

  it("still rejects an active that authorizes nothing at all", () => {
    const input = structure();
    input.actives[0]!.operations = [];
    input.actives[0]!.operationsHex = "00".repeat(32);
    expect(() => validatePermissionStructure(input)).toThrowError(/at least one contract type/);
  });

  it("rejects unsafe thresholds, duplicate ids/addresses, unknown operations, and control names", () => {
    const high = structure();
    high.owner.threshold = 3;
    expect(() => validatePermissionStructure(high)).toThrowError(/threshold exceeds/);

    const duplicateAddress = structure();
    duplicateAddress.owner.keys[1]!.address = A;
    expect(() => validatePermissionStructure(duplicateAddress)).toThrowError(/duplicate address/);

    const duplicateId = structure();
    duplicateId.actives.push({ ...duplicateId.actives[0]!, name: "second" });
    expect(() => validatePermissionStructure(duplicateId)).toThrowError(/ids must be unique/);

    const unknown = structure();
    unknown.actives[0]!.operations = ["FutureContract"];
    expect(() => validatePermissionStructure(unknown)).toThrowError(/unknown TRON contract/);

    const control = structure();
    control.actives[0]!.name = "safe\u001b[31m";
    expect(() => validatePermissionStructure(control)).toThrowError(/control characters/);
  });

  it("matches the Java protocol guard that witness permission has exactly one key", () => {
    const input = structure();
    input.witness = {
      id: 1,
      threshold: 1,
      keys: [{ address: A, weight: 1 }, { address: B, weight: 1 }],
    } as never;
    expect(() => validatePermissionStructure(input)).toThrowError(/exactly 1 key/);
  });

  it("rejects integers outside the exact TronWeb range and another account's export", () => {
    const input = structure() as unknown as { owner: { threshold: unknown } };
    input.owner.threshold = "9007199254740992";
    expect(() => validatePermissionStructure(input)).toThrowError(/precise integer range/);
    expect(() => validatePermissionStructure(structure(), B)).toThrowError(/does not match/);
  });
});

describe("local key inventory and lockout warnings", () => {
  const account = (type: AccountDescriptor["type"], address: string, label: string): AccountDescriptor => ({
    accountId: `wlt_${label}` as never,
    label,
    type,
    index: null,
    active: false,
    addresses: { tron: address },
  });

  it("excludes watch-only keys, de-duplicates addresses, and ignores forged labels", () => {
    const inventory = buildLocalPermissionInventory([
      account("privateKey", A, "main"),
      account("ledger", A, "duplicate"),
      account("watch", B, "watch"),
    ]);
    expect([...inventory.entries()]).toEqual([[A, "main"]]);
    const annotated = annotateLocalPermissionKeys(validatePermissionStructure(structure()), inventory);
    expect(annotated.owner.keys.map((key) => key.local)).toEqual(["main", null]);
    expect(permissionSafetyWarnings(annotated, inventory)).toEqual([
      expect.objectContaining({ code: "owner_lockout_partial" }),
    ]);
  });

  it("reports complete owner lockout and active permission escalation", () => {
    const input = structure();
    input.actives[0]!.operations.push("AccountPermissionUpdateContract");
    input.actives[0]!.operationsHex = encodeOperations(input.actives[0]!.operations);
    const warnings = permissionSafetyWarnings(validatePermissionStructure(input), new Map([[C, "other"]]));
    expect(warnings.map((warning) => warning.code)).toEqual([
      "owner_lockout",
      "active_can_update_permission",
    ]);
  });

  // Preserving bits we cannot name is the safe default, but it is still scope the user cannot see
  // in the operation list — --dry-run has to say so rather than render an empty warnings array.
  it("warns that preserved unnamed operations are scope the reader cannot inspect", () => {
    const input = structure();
    input.actives[0]!.operationsHex = "86000080" + "00".repeat(28);
    input.actives[0]!.unknownOperationIds = [7];
    const inventory = new Map([[A, "main"]]);
    const warnings = permissionSafetyWarnings(validatePermissionStructure(input), inventory);
    expect(warnings).toContainEqual(expect.objectContaining({
      code: "active_unknown_operations",
      message: expect.stringContaining("7"),
    }));
  });
});
