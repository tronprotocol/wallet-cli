import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import { registerX402Commands } from "./x402.js";
import { neutralInputSchema } from "../shell/index.js";
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
      neutralInputSchema(pay).safeParse({
        url: "https://example.test",
        method: "GET",
        header: [],
        maxAmount: "1",
        maxRawAmount: "1",
        token: "USDT",
      }).success,
    ).toBe(false);
  });

  it("rejects using inline and file request bodies together", () => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    expect(
      neutralInputSchema(pay).safeParse({
        url: "https://example.test",
        method: "POST",
        header: [],
        body: "{}",
        bodyFile: "request.json",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["0", false],
    [(1n << 256n).toString(), false],
    ["1", true],
    [((1n << 256n) - 1n).toString(), true],
  ])("validates --max-gasfree-fee-raw %s like --max-raw-amount", (value, valid) => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    const base = { url: "https://example.test", method: "GET", header: [] };
    const fee = neutralInputSchema(pay).safeParse({ ...base, maxGasfreeFeeRaw: value });
    const raw = neutralInputSchema(pay).safeParse({ ...base, maxRawAmount: value, token: "USDT" });
    expect(fee.success).toBe(valid);
    expect(raw.success).toBe(valid);
    if (!valid) {
      expect(fee.error!.issues[0]).toMatchObject({
        path: ["maxGasfreeFeeRaw"],
        params: { errorCode: "invalid_amount" },
      });
    }
  });

  it("rejects conflicting GasFree fee ceilings", () => {
    const registry = new CommandRegistry();
    registerX402Commands(registry, service());
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    expect(
      neutralInputSchema(pay).safeParse({
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
    expect(registry.resolveNeutral(["x402", command])!.rejectsWait).toBeDefined();
});

it.each(["password", "privateKey", "mnemonic", "apiKey", "tx", "message"])(
  "refuses --body-file - when --%s-stdin also claims stdin, without reading or sending",
  async (kind) => {
    const registry = new CommandRegistry();
    const svc = service();
    registerX402Commands(registry, svc);
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    const readStdinOnce = vi.fn(() => "secret");
    const readStdinBytesOnce = vi.fn(() => Buffer.from("secret"));
    const ctx = {
      secrets: { has: (k: string) => k === kind },
      streams: { readStdinOnce, readStdinBytesOnce },
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
    expect(readStdinBytesOnce).not.toHaveBeenCalled();
    expect(svc.pay).not.toHaveBeenCalled();
  },
);

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

describe("x402 pay headers", () => {
  const run = async (header: string[]) => {
    const registry = new CommandRegistry();
    const svc = service();
    registerX402Commands(registry, svc);
    const pay = registry.resolveNeutral(["x402", "pay"])!;
    await pay.run({} as never, { id: "eip155:56" } as never, {
      url: "https://example.test",
      method: "GET",
      header,
    });
    return svc.pay as ReturnType<typeof vi.fn>;
  };

  it("splits each header argument at its first colon before calling the use case", async () => {
    const pay = await run(["X-Test:  a:b ", "Accept: */*"]);
    expect(pay.mock.calls[0]![2]).toMatchObject({
      headers: [
        { name: "X-Test", value: "a:b" },
        { name: "Accept", value: "*/*" },
      ],
    });
  });

  it.each(["not-a-header", ": value"])("rejects %j before calling the use case", async (line) => {
    await expect(run([line])).rejects.toMatchObject({
      code: "invalid_value",
      message: '--header must use "Name: value"',
    });
  });
});

describe("x402 roundtrip output", () => {
  it("returns the served and paid views without the normalized settlement", async () => {
    const registry = new CommandRegistry();
    const svc = service();
    (svc.roundtrip as ReturnType<typeof vi.fn>).mockResolvedValue({
      serve: { payUrl: "u" },
      pay: { settled: true },
      settlement: { success: true },
    });
    registerX402Commands(registry, svc);
    const roundtrip = registry.resolveNeutral(["x402", "roundtrip"])!;
    await expect(
      roundtrip.run({} as never, { id: "eip155:56" } as never, { payTo: "p", scheme: "exact" }),
    ).resolves.toEqual({ serve: { payUrl: "u" }, pay: { settled: true } });
  });
});
