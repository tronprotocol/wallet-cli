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
});
