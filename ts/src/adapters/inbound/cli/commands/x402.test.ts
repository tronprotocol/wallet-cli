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
      "provider-endpoints",
      "provider-update",
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
