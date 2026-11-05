import { describe, expect, it, vi } from "vitest";
import type { TronMultisigCollaborationService } from "../../../../application/use-cases/tron/multisig-collaboration-service.js";
import { txTronLinkMultisigBinding, txTronLinkMultisigSpec } from "./tx.js";
import { chainInputSchema, parseInputSchema } from "../shell/index.js";
import { CommandDeadline } from "../../../../application/services/command-deadline.js";

const NO_DEADLINE = new CommandDeadline(0);

const A = "TLZz5XKerAAebbRdScB3jmSPr5DHSpGJJP";
const NETWORK = { family: "tron", nativeSymbol: "TRX", id: "tron:3448148188" } as never;
const TX_ID = "ab".repeat(32);

function harness() {
  const service = {
    create: vi.fn(async () => ({ action: "create" })),
    sign: vi.fn(async () => ({ action: "sign" })),
    list: vi.fn(async () => ({ action: "list" })),
    watch: vi.fn(async () => ({ action: "watch" })),
  } as unknown as TronMultisigCollaborationService;
  const ctx = {
    deadline: NO_DEADLINE,
    resolveAddress: () => A,
    streams: { event: vi.fn() },
  } as never;
  return { service, ctx, run: txTronLinkMultisigBinding(service).run };
}

describe("tx multisig binding", () => {
  it("routes --create through the signing scope, not the resolved address", async () => {
    const { service, ctx, run } = harness();
    await run(ctx, NETWORK, { create: true, hex: "aabb" } as never);

    expect(service.create).toHaveBeenCalledWith(ctx, NETWORK, "aabb");
    expect(service.sign).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
  });

  it("routes --sign through the same scope and leaves create alone", async () => {
    const { service, ctx, run } = harness();
    await run(ctx, NETWORK, { sign: TX_ID } as never);

    expect(service.sign).toHaveBeenCalledWith(ctx, NETWORK, TX_ID);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("lists for the resolved address when no mode flag is given", async () => {
    const { service, ctx, run } = harness();
    await run(ctx, NETWORK, {} as never);

    expect(service.list).toHaveBeenCalledWith(NO_DEADLINE, NETWORK, A);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.sign).not.toHaveBeenCalled();
  });
});

describe("tx multisig input groups", () => {
  const schema = chainInputSchema(
    txTronLinkMultisigSpec,
    txTronLinkMultisigBinding({} as never),
  ).input;

  it.each([
    { create: true, hex: "aabb", file: "tx.hex" },
    { create: true },
    { hex: "aabb" },
    { sign: TX_ID, file: "tx.hex" },
    { create: true, sign: TX_ID, hex: "aabb" },
    { create: true, watch: true, hex: "aabb" },
  ])("reports %j as invalid_option", (input) => {
    expect(() => parseInputSchema(schema, input)).toThrowError(
      expect.objectContaining({ code: "invalid_option" }),
    );
  });

  it("accepts --create with one transaction source", () => {
    expect(parseInputSchema(schema, { create: true, file: "tx.hex" })).toMatchObject({
      create: true,
      file: "tx.hex",
    });
  });
});
