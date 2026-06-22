import { describe, expect, it, vi } from "vitest";
import { accountCommands } from "./account.js";
import type { EffectiveTokenEntry, ExecutionContext, NetworkDescriptor } from "../../core/types/index.js";
import type { Services } from "../services.js";

const ADDRESS = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const ACCOUNT = "wlt_test.0";

function assetsCommand(services: Services) {
  const cmd = accountCommands(services).find((c) => c.id === "tron.account.assets");
  if (!cmd) throw new Error("assets command not found");
  return cmd;
}

function ctx(): ExecutionContext {
  return {
    activeAccount: ACCOUNT,
    resolveAddress: vi.fn(() => ADDRESS),
  } as unknown as ExecutionContext;
}

function net(rpc: Record<string, unknown>): NetworkDescriptor {
  return { id: "tron:nile", family: "tron", chainId: "nile", aliases: [], capabilities: [], rpc: rpc as any };
}

function services(tokens: EffectiveTokenEntry[]): Services {
  return {
    tokenBook: {
      effective: vi.fn(() => tokens),
    },
  } as unknown as Services;
}

describe("tron account assets", () => {
  it("defaults to every token in the effective token book", async () => {
    const svc = services([
      { kind: "trc20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", symbol: "USDT", decimals: 6, name: "Tether USD", source: "official" },
      { kind: "trc10", id: "1002000", symbol: "BTT", decimals: 6, source: "user" },
    ]);
    const rpc = {
      getTrc20Balance: vi.fn(async () => "123"),
      getTrc10Balance: vi.fn(async () => "456"),
    };

    const result: any = await assetsCommand(svc).run(ctx(), net(rpc), {});

    expect(svc.tokenBook.effective).toHaveBeenCalledWith("tron:nile", ACCOUNT);
    expect(rpc.getTrc20Balance).toHaveBeenCalledWith("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", ADDRESS);
    expect(rpc.getTrc10Balance).toHaveBeenCalledWith("1002000", ADDRESS);
    expect(result.assets).toEqual([
      { token: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", kind: "trc20", balance: "123", symbol: "USDT", decimals: 6, name: "Tether USD", source: "official" },
      { token: "1002000", kind: "trc10", balance: "456", symbol: "BTT", decimals: 6, name: undefined, source: "user" },
    ]);
  });

  it("--tokens is an explicit override and does not read the token book", async () => {
    const svc = services([
      { kind: "trc20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", symbol: "USDT", decimals: 6, source: "official" },
    ]);
    const rpc = {
      getTrc20Balance: vi.fn(async () => "1"),
      getTrc10Balance: vi.fn(async () => "2"),
    };

    const result: any = await assetsCommand(svc).run(ctx(), net(rpc), { tokens: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb,1002000" });

    expect(svc.tokenBook.effective).not.toHaveBeenCalled();
    expect(result.assets).toEqual([
      { token: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", kind: "trc20", balance: "1" },
      { token: "1002000", kind: "trc10", balance: "2" },
    ]);
  });
});
