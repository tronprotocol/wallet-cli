import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import { baiRechargeSpec, registerBaiCommands } from "./bai.js";
import type { BaiService } from "../../../../application/use-cases/bai-service.js";

function service(): BaiService {
  return {
    usage: vi.fn(async () => ({})),
    usageList: vi.fn(async () => ({ records: [], pagination: {} })),
    rechargeList: vi.fn(async () => ({ orders: [], pagination: {} })),
    recharge: vi.fn(async () => ({})),
  } as unknown as BaiService;
}

describe("B.AI command surface", () => {
  it("registers recharge plus three API-backed read commands under bai", () => {
    const registry = new CommandRegistry();
    registerBaiCommands(registry, service());
    expect(
      ["usage-summary", "usage-records", "recharge-orders"].map((verb) =>
        registry.resolveNeutral(["bai", verb])?.path.join("."),
      ),
    ).toEqual(["bai.usage-summary", "bai.usage-records", "bai.recharge-orders"]);
    expect(registry.resolveNeutral(["bai", "status"])).toBeNull();
    expect(registry.resolveChain(["bai", "recharge"])?.spec.network).toBe("optional");
  });

  it("exposes summary without dates and keeps bounded list pagination", () => {
    const registry = new CommandRegistry();
    registerBaiCommands(registry, service());
    expect(Object.keys(registry.resolveNeutral(["bai", "usage-summary"])!.fields.shape)).toEqual(
      [],
    );
    expect(
      registry.resolveNeutral(["bai", "usage-records"])!.input.safeParse({
        limit: 20,
        offset: 0,
        sort: "desc",
      }).success,
    ).toBe(true);
    expect(
      registry.resolveNeutral(["bai", "usage-records"])!.input.safeParse({ limit: 1001 }).success,
    ).toBe(false);
  });

  it("uses one recharge command for self recharge and recipient recharge", async () => {
    const recharge = vi.fn(async (_ctx, _network, input) => input);
    const registry = new CommandRegistry();
    registerBaiCommands(registry, { ...service(), recharge } as unknown as BaiService);
    const entry = registry.resolveChain(["bai", "recharge"])!;
    const command = { input: entry.spec.baseFields, run: entry.families.tron!.run };

    const selfInput = command.input.parse({ amount: "10", token: "USDT" });
    await expect(
      command.run(
        { config: { baiApiKey: "test-key" } } as never,
        { id: "tron:728126428" } as never,
        selfInput,
      ),
    ).resolves.toMatchObject({ amount: "10", token: "USDT" });

    const recipientInput = command.input.parse({
      amount: "10",
      token: "USDT",
      to: "recipient@example.com",
    });
    await expect(
      command.run(
        { config: { baiApiKey: "test-key" } } as never,
        { id: "tron:728126428" } as never,
        recipientInput,
      ),
    ).resolves.toMatchObject({
      amount: "10",
      token: "USDT",
      to: "recipient@example.com",
    });
  });
});

it("exposes report-only recovery without wallet authentication or chain broadcast", () => {
  const registry = new CommandRegistry();
  registerBaiCommands(registry, service());
  const command = registry.resolveNeutral(["bai", "report-recharge"])!;
  expect(command).toMatchObject({
    network: "none",
    wallet: "none",
    auth: "none",
    broadcasts: false,
  });
  const input = { chain: "base", txHash: "0x" + "a".repeat(64) };
  expect(command.input.safeParse(input).success).toBe(true);
  expect(command.input.safeParse({ ...input, to: "recipient" }).success).toBe(false);
  expect(command.input.safeParse({ ...input, chain: "tron" }).success).toBe(false);
  expect(
    command.input.safeParse({ ...input, to: "recipient", targetId: "original-id" }).success,
  ).toBe(true);
});

it("shares recharge schema across families and selects the Base token in its binding", async () => {
  const registry = new CommandRegistry();
  const recharge = vi.fn(async (_ctx, _network, input) => input);
  registerBaiCommands(registry, { ...service(), recharge } as unknown as BaiService);
  expect(registry.resolveNeutral(["bai", "recharge"])).toBeNull();
  const command = registry.resolveChain(["bai", "recharge"])!;
  expect(Object.keys(command.families).sort()).toEqual(["evm", "tron"]);
  await expect(
    command.families.evm!.run(
      { config: { baiApiKey: "test-key" } } as never,
      { id: "eip155:8453", family: "evm" } as never,
      command.spec.baseFields.parse({ amount: "1" }),
    ),
  ).resolves.toMatchObject({ amount: "1", token: "USDC" });
  for (const field of ["signOnly", "buildOnly"])
    expect(command.spec.baseFields.shape).not.toHaveProperty(field);
});

it.each(["0", "0.000", "-1", "1e3", "9007199254740992", "1." + "0".repeat(100)])(
  "rejects invalid recharge amount %s at the command boundary",
  (amount) => {
    const result = baiRechargeSpec.baseFields.safeParse({ amount });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        params: { errorCode: "invalid_amount" },
      });
  },
);
