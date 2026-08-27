import { describe, it, expect } from "vitest";
import {
  txBroadcastSpec,
  txBroadcastTronBinding,
  txSendSpec,
  txSignSpec,
  txSignTronBinding,
  txTronLinkMultisigSpec,
} from "./tx.js";

const ctx = { activeAccount: "main" } as never;
const net = { family: "tron", nativeSymbol: "TRX", id: "nile" } as never;

describe("tx sign spec", () => {
  it("does not broadcast and requires auth", () => {
    expect(txSignSpec.path).toEqual(["tx", "sign"]);
    expect(txSignSpec.broadcasts).toBeFalsy();
    expect(txSignSpec.auth).toBe("required");
  });

  it("accepts the retained JSON input and the new hex/file inputs", () => {
    expect(txSignSpec.baseFields.safeParse({ transaction: "{}" }).success).toBe(true);
    expect(txSignSpec.baseFields.safeParse({ hex: "abcd" }).success).toBe(true);
    expect(txSignSpec.baseFields.safeParse({ file: "tx.hex" }).success).toBe(true);
    expect(txSignSpec.baseFields.safeParse({ hex: "abcd", offline: true }).success).toBe(true);
  });

  // The online permission/approval check is the default (doc §3.2.1); --offline opts out of it.
  // --check is gone: it was the inverted spelling and never shipped in a release.
  it("exposes --offline and no longer exposes --check", () => {
    expect(Object.keys(txSignSpec.baseFields.shape)).toContain("offline");
    expect(Object.keys(txSignSpec.baseFields.shape)).not.toContain("check");
  });

  it("defaults --offline to false so signing verifies online unless asked not to", () => {
    const parsed = txSignSpec.baseFields.parse({ hex: "abcd" });
    expect(parsed.offline).toBe(false);
  });

  // the payload is not a secret, so argv is the only channel — no --tx-stdin on this command.
  it("declares no stdin channel", () => {
    expect(txSignSpec.stdin).toBeUndefined();
  });
});

describe("tx sign binding", () => {
  it("parses the JSON payload and hands it to the service", async () => {
    let received: unknown;
    const svc = {
      sign: async (_c: unknown, _n: unknown, tx: unknown) => {
        received = tx;
        return { kind: "sign" };
      },
    };
    await txSignTronBinding(svc as never, {} as never, {} as never, {} as never).run(ctx, net, {
      transaction: '{"txID":"abc"}',
    });
    expect(received).toEqual({ txID: "abc" });
  });

  it("rejects malformed JSON with invalid_value", async () => {
    const svc = { sign: async () => ({}) };
    await expect(
      txSignTronBinding(svc as never, {} as never, {} as never, {} as never).run(ctx, net, {
        transaction: "not json",
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  const offlineSigner = () => ({
    sign: async () => ({
      kind: "tx-sign",
      hex: "beef",
      signer: "T1",
      checked: false,
      transaction: {},
    }),
  });
  const checkedSigner = () => ({
    signChecked: async () => ({
      kind: "tx-sign",
      hex: "beef",
      signer: "T1",
      checked: true,
      signerWeight: 1,
      transaction: {},
      approval: {},
    }),
  });
  const rejectOffline = {
    sign: async () => {
      throw new Error("unexpected offline route");
    },
  };
  const rejectChecked = {
    signChecked: async () => {
      throw new Error("unexpected checked route");
    },
  };

  // Default: verify signer permission and resulting weight online (doc §3.2.1). A co-signer who is
  // not in the permission group, or who already signed, must fail before a signature is produced —
  // not silently emit a hex that only `tx broadcast` will reject, after it has been passed on.
  it("routes hex signing through the multisig authorization service by default", async () => {
    await expect(
      txSignTronBinding(
        {} as never,
        rejectOffline as never,
        checkedSigner() as never,
        {} as never,
      ).run(ctx, net, { hex: "abcd", offline: false }),
    ).resolves.toMatchObject({ checked: true, signerWeight: 1 });
  });

  it("treats an absent --offline exactly like --offline false", async () => {
    await expect(
      txSignTronBinding(
        {} as never,
        rejectOffline as never,
        checkedSigner() as never,
        {} as never,
      ).run(ctx, net, { hex: "abcd" }),
    ).resolves.toMatchObject({ checked: true });
  });

  it("routes --offline through the local signing service, never touching the node", async () => {
    await expect(
      txSignTronBinding(
        {} as never,
        offlineSigner() as never,
        rejectChecked as never,
        {} as never,
      ).run(ctx, net, { hex: "abcd", offline: true }),
    ).resolves.toMatchObject({ checked: false });
  });

  it("writes --out on both routes", async () => {
    for (const input of [
      { hex: "abcd", out: "signed.hex" },
      { hex: "abcd", out: "signed.hex", offline: true },
    ]) {
      let written: unknown;
      const writer = {
        write: (path: string, hex: string) => {
          written = { path, hex };
        },
      };
      const result = await txSignTronBinding(
        {} as never,
        offlineSigner() as never,
        checkedSigner() as never,
        writer as never,
      ).run(ctx, net, input);
      expect(written).toEqual({ path: "signed.hex", hex: "beef" });
      expect(result).toMatchObject({ out: "signed.hex", hex: "beef" });
    }
  });

  it("rejects --offline with the JSON payload route, which has no online check to skip", async () => {
    const svc = { sign: async () => ({ kind: "sign" }) };
    await expect(
      txSignTronBinding(svc as never, {} as never, {} as never, {} as never).run(ctx, net, {
        transaction: "{}",
        offline: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });
});

// v4.10.0 shipped `tx sign --transaction <json>` as the only form. That contract must survive the
// multisig work: the JSON route still returns the transaction service's result verbatim, and the
// new `kind:"tx-sign"` shape appears only for --hex/--file, which did not exist in 4.10.0.
describe("tx sign 4.10.0 JSON compatibility", () => {
  it("returns the transaction service result unwrapped and unannotated", async () => {
    const legacy = {
      kind: "sign",
      mode: "sign-only",
      signed: { txID: "abc" },
      address: "T1",
      txId: "abc",
    };
    const svc = { sign: async () => legacy };
    const result = await txSignTronBinding(svc as never, {} as never, {} as never, {} as never).run(
      ctx,
      net,
      { transaction: '{"txID":"abc"}' },
    );
    expect(result).toEqual(legacy);
    expect(result).not.toHaveProperty("checked");
    expect(result).not.toHaveProperty("approval");
  });

  it("still accepts the 4.10.0 invocation with no new flags", () => {
    expect(txSignSpec.baseFields.safeParse({ transaction: '{"txID":"abc"}' }).success).toBe(true);
  });
});

// tx send carries both flavours, and conflating them would be a new lie in the help:
// the amount pair is jointly required, the asset trio is not (omit all three → native TRX).
describe("tx send exclusive groups", () => {
  const groups = () => Object.fromEntries((txSendSpec.exclusive ?? []).map((g) => [g.flags[0], g]));

  it("marks the amount pair jointly required", () => {
    expect(groups().amount).toEqual({
      label: "the amount to send",
      flags: ["amount", "raw-amount"],
      select: "exactly-one",
    });
  });

  it("marks the asset selector optional, since omitting it sends the native coin", () => {
    // `--asset-id` is TRON-only and is declared on that binding. An exclusive group is
    // spec-level and therefore shared by every family, so it may only name flags they all have.
    expect(groups().token).toEqual({
      label: "which asset to send; omit for the network's native coin",
      flags: ["token", "contract"],
      select: "at-most-one",
    });
    expect(txSendSpec.baseFields.safeParse({ to: "T...", amount: "1" }).success).toBe(true);
  });

  it("states each exclusivity once — in the group, not also in a field description", () => {
    const descriptions = Object.values(txSendSpec.baseFields.shape).map(
      (field) => (field as { description?: string }).description ?? "",
    );
    expect(descriptions.filter((d) => d.includes("mutually exclusive"))).toEqual([]);
  });
});

describe("tx broadcast binding", () => {
  const broadcastContext = (stdin?: string, wait = false) =>
    ({
      wait,
      secrets: {
        has: (kind: string) => kind === "tx" && stdin !== undefined,
        pick: (inline: string | undefined) => inline ?? stdin,
      },
    }) as never;

  it("retains JSON/stdin inputs and adds hex/file inputs", () => {
    expect(txBroadcastSpec.baseFields.safeParse({ transaction: "{}" }).success).toBe(true);
    expect(txBroadcastSpec.baseFields.safeParse({ hex: "abcd" }).success).toBe(true);
    expect(txBroadcastSpec.baseFields.safeParse({ file: "tx.hex" }).success).toBe(true);
  });

  // The exclusive group is the single source of truth for "pick exactly one of these four",
  // on both the human help and the --json-schema catalog. Restating it inside a field
  // description is a second copy that drifts the moment an input is added or renamed.
  it("declares every input in one exclusive group and nowhere else", () => {
    expect(txBroadcastSpec.exclusive).toEqual([
      {
        label: "the signed transaction to broadcast",
        flags: ["transaction", "tx-stdin", "hex", "file"],
      },
    ]);
    const descriptions = Object.values(txBroadcastSpec.baseFields.shape).map(
      (field) => (field as { description?: string }).description ?? "",
    );
    expect(descriptions.filter((d) => d.includes("mutually exclusive"))).toEqual([]);
  });

  it("routes protobuf hex without parsing it as JSON", async () => {
    const service = {
      broadcastHex: async (_ctx: unknown, _net: unknown, hex: string, dryRun: boolean) => ({
        hex,
        dryRun,
      }),
      broadcastJson: async () => {
        throw new Error("unexpected JSON route");
      },
    };
    await expect(
      txBroadcastTronBinding(service as never).run(broadcastContext(), net, {
        hex: "aabb",
        dryRun: true,
      }),
    ).resolves.toEqual({ hex: "aabb", dryRun: true });
  });

  it("routes the retained --tx-stdin JSON source", async () => {
    let received: unknown;
    const service = {
      broadcastHex: async () => {
        throw new Error("unexpected hex route");
      },
      broadcastJson: async (_ctx: unknown, _net: unknown, transaction: unknown) => {
        received = transaction;
        return { txId: "abc" };
      },
    };
    await txBroadcastTronBinding(service as never).run(broadcastContext('{"txID":"abc"}'), net, {
      dryRun: false,
    });
    expect(received).toEqual({ txID: "abc" });
  });

  it("rejects ambiguous input and --wait with --dry-run", async () => {
    const service = { broadcastHex: async () => ({}), broadcastJson: async () => ({}) };
    await expect(
      txBroadcastTronBinding(service as never).run(broadcastContext(), net, {
        transaction: "{}",
        hex: "aabb",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_option" });
    await expect(
      txBroadcastTronBinding(service as never).run(broadcastContext(undefined, true), net, {
        hex: "aabb",
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });
});

describe("tx multisig spec", () => {
  it("supports list, unsigned create, sign, and WebSocket watch modes", () => {
    expect(txTronLinkMultisigSpec.baseFields.safeParse({}).success).toBe(true);
    expect(txTronLinkMultisigSpec.baseFields.safeParse({ create: true, hex: "aabb" }).success).toBe(
      true,
    );
    expect(txTronLinkMultisigSpec.baseFields.safeParse({ sign: "ab".repeat(32) }).success).toBe(
      true,
    );
    expect(txTronLinkMultisigSpec.baseFields.safeParse({ watch: true }).success).toBe(true);
  });

  it("declares no broadcast and only requires auth for --sign", () => {
    expect(txTronLinkMultisigSpec.broadcasts).toBeFalsy();
    expect(txTronLinkMultisigSpec.auth).toBe("conditional");
    expect(txTronLinkMultisigSpec.passwordMode).toBeUndefined();
  });
});
