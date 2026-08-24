import { describe, expect, it, vi } from "vitest";
import type { TronMultisigCollaborationService } from "../../../../application/use-cases/tron/multisig-collaboration-service.js";
import { txTronLinkMultisigBinding } from "./tx.js";

const A = "TLZz5XKerAAebbRdScB3jmSPr5DHSpGJJP";
const NETWORK = { family: "tron", nativeSymbol: "TRX", id: "tron:nile" } as never;
const TX_ID = "ab".repeat(32);

function harness() {
  const service = {
    create: vi.fn(async () => ({ action: "create" })),
    sign: vi.fn(async () => ({ action: "sign" })),
    list: vi.fn(async () => ({ action: "list" })),
    watch: vi.fn(async () => ({ action: "watch" })),
  } as unknown as TronMultisigCollaborationService;
  const ctx = {
    resolveAddress: () => A,
    streams: { event: vi.fn() },
  } as never;
  return { service, ctx, run: txTronLinkMultisigBinding(service).run };
}

describe("tx multisig binding", () => {
  // --create signs, so it must receive the execution scope. Handing it the bare address instead
  // would still typecheck at the call site and fail only at runtime, in the signing step.
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

    expect(service.list).toHaveBeenCalledWith(NETWORK, A);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.sign).not.toHaveBeenCalled();
  });
});
