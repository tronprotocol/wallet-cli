import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import { registerBaiCommands } from "./bai.js";
import type { BaiService } from "../../../../application/use-cases/bai-service.js";

function service(): BaiService {
  return {
    status: vi.fn(async () => ({ credits: "10", thisMonth: {}, trend: [] })),
    usage: vi.fn(async () => ({})),
    usageList: vi.fn(async () => ({ records: [], pagination: {} })),
    rechargeList: vi.fn(async () => ({ orders: [], pagination: {} })),
    recharge: vi.fn(async () => ({})),
  } as unknown as BaiService;
}

describe("B.AI command surface", () => {
  it("registers recharge plus four API-backed read commands under bai", () => {
    const registry = new CommandRegistry();
    registerBaiCommands(registry, service());
    expect(
      ["status", "usage", "usage-list", "recharge-list"].map((verb) =>
        registry.resolveNeutral(["bai", verb])?.path.join("."),
      ),
    ).toEqual(["bai.status", "bai.usage", "bai.usage-list", "bai.recharge-list"]);
    expect(registry.resolveNeutral(["bai", "recharge"])?.network).toBe("optional");
  });

  it("exposes usage dates and bounded list pagination", () => {
    const registry = new CommandRegistry();
    registerBaiCommands(registry, service());
    expect(Object.keys(registry.resolveNeutral(["bai", "usage"])!.fields.shape)).toEqual([
      "from",
      "to",
    ]);
    expect(
      registry.resolveNeutral(["bai", "usage-list"])!.input.safeParse({
        limit: 20,
        offset: 0,
        sort: "desc",
      }).success,
    ).toBe(true);
    expect(
      registry.resolveNeutral(["bai", "usage-list"])!.input.safeParse({ limit: 1001 }).success,
    ).toBe(false);
  });
});
