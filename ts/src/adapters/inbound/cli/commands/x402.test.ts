import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import { registerX402Commands } from "./x402.js";
import type { X402Service } from "../../../../application/use-cases/x402-service.js";

function service(): X402Service {
  return {
    pay: vi.fn(async () => ({})),
    providerList: vi.fn(async () => ({})),
    providerShow: vi.fn(async () => ({})),
    providerEndpoints: vi.fn(async () => ({})),
    providerUpdate: vi.fn(async () => ({})),
    serve: vi.fn(async () => ({})),
    roundtrip: vi.fn(async () => ({})),
  } as unknown as X402Service;
}

describe("x402 command surface", () => {
  it("registers pay for EVM and TRON and four provider commands", () => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());

    const pay = registry.resolveNeutral(["x402", "pay"]);
    expect(pay?.network).toBe("optional");
    for (const verb of [
      "serve",
      "roundtrip",
      "provider-list",
      "provider-show",
      "endpoint-list",
      "update-catalog",
    ]) {
      expect(registry.resolveNeutral(["x402", verb])?.path).toEqual(["x402", verb]);
    }
  });

  it("does not register search or gateway commands", () => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());
    expect(registry.resolveNeutral(["x402", "search"])).toBeNull();
    expect(registry.resolveNeutral(["x402", "gateway"])).toBeNull();
  });

  it("exposes dry-run and mutually exclusive payment limits", () => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    expect(Object.keys(pay.fields.shape)).toContain("dryRun");
    expect(
      pay.input.safeParse({
        url: "https://example.test",
        method: "GET",
        header: [],
        maxAmount: "1",
        maxRawAmount: "1",
      }).success,
    ).toBe(false);
  });

  it("rejects using inline and file request bodies together", () => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    expect(
      pay.input.safeParse({
        url: "https://example.test",
        method: "POST",
        header: [],
        body: "{}",
        bodyFile: "request.json",
      }).success,
    ).toBe(false);
  });

  it("rejects conflicting GasFree fee ceilings", () => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    expect(
      pay.input.safeParse({
        url: "https://example.test",
        method: "GET",
        header: [],
        maxGasfreeFee: "1",
        maxGasfreeFeeRaw: "1",
      }).success,
    ).toBe(false);
  });
});

it("does not advertise unsupported provider type or facilitator waiting", () => {
  const registry = new CommandRegistry();
  registerX402Commands(registry, service());
  expect(registry.resolveNeutral(["x402", "provider-list"])!.fields.shape).not.toHaveProperty(
    "type",
  );
  for (const command of ["pay", "roundtrip"])
    expect(registry.resolveNeutral(["x402", command])!.supportsWait).toBe(false);
});

/**
 * `--body-file -` reads the same fd 0 a `--*-stdin` secret is bound to. Refusing only
 * `--password-stdin` let `--api-key-stdin` (or any other secret) be read as the request body and
 * posted to the endpoint. Every secret bound to stdin must refuse the body, before anything is read.
 */
it.each(["password", "apiKey", "tx", "message"])(
  "refuses --body-file - when --%s-stdin also claims stdin, without reading or sending",
  async (kind) => {
    const registry = new CommandRegistry();
    const svc = service();
    registerX402Commands(registry, svc);
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    const readStdinOnce = vi.fn(() => "secret");
    const ctx = {
      secrets: { has: (k: string) => k === kind },
      streams: { readStdinOnce },
    };
    await expect(
      pay.run(ctx as never, { id: "eip155:56" } as never, {
        url: "https://example.test",
        method: "POST",
        header: [],
        bodyFile: "-",
      }),
    ).rejects.toMatchObject({ code: "invalid_option" });
    expect(readStdinOnce).not.toHaveBeenCalled();
    expect(svc.pay).not.toHaveBeenCalled();
  },
);

/**
 * Catalog warnings come from a remote document and go to the terminal through the diagnostic
 * channel, which — unlike the result renderer — does not strip terminal control sequences.
 */
it("strips terminal control sequences from remote catalog warnings before warning", async () => {
  const registry = new CommandRegistry();
  const svc = service();
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  (svc.providerList as ReturnType<typeof vi.fn>).mockResolvedValue({
    providers: [],
    warnings: [`stale ${ESC}[2J${ESC}[H${BEL}catalog`, "plain"],
  });
  registerX402Commands(registry, svc);
  const list = registry.resolveNeutral(["x402", "provider-list"])!;
  const warn = vi.fn();
  await list.run({ warn, emit: vi.fn() } as never, undefined, { limit: 20, offset: 0 });
  expect(warn).toHaveBeenCalledTimes(2);
  for (const [message] of warn.mock.calls) {
    expect(message).not.toContain(ESC);
    expect(message).not.toContain(BEL);
  }
  expect(warn).toHaveBeenCalledWith("plain");
  expect(warn.mock.calls[0]![0]).toContain("stale");
  expect(warn.mock.calls[0]![0]).toContain("catalog");
});
