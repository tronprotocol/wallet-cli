import { describe, it, expect } from "vitest";
import { EvmTokenService } from "./token-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { NetworkDescriptor, TokenEntry } from "../../../domain/types/index.js";
import { CommandDeadline } from "../../services/command-deadline.js";
import { DeadlineExpiredError } from "../../contracts/deadline.js";

const NO_DEADLINE = new CommandDeadline(0);

const scope: AccountScope = {
  deadline: new CommandDeadline(0),
  activeAccount: "wlt_test.0",
  resolveAddress: () => "0xOWNER",
};
const net = { id: "eip155:1", family: "evm", nativeSymbol: "ETH" } as NetworkDescriptor;
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

function service(
  meta: { symbol?: string; decimals?: number; name?: string } = {},
  balance = "5000000",
) {
  const removed: unknown[] = [];
  const added: TokenEntry[] = [];
  const gateway = {
    getErc20Balance: async () => balance,
    getErc20Metadata: async () => meta,
  };
  const tokens = {
    add: (_n: string, _a: string, entry: TokenEntry) => {
      added.push(entry);
      return "added" as const;
    },
    remove: (...args: unknown[]) => {
      removed.push(args);
      return { kind: "erc20", id: USDT, symbol: "USDT", decimals: 6 };
    },
  } as unknown as TokenRepository;
  const svc = new EvmTokenService(
    { get: () => gateway } as unknown as ChainGatewayProvider,
    tokens,
  );
  return { svc, added, removed };
}

describe("EvmTokenService.balance", () => {
  it("returns the raw balance with the contract's metadata", async () => {
    const { svc } = service({ symbol: "USDT", decimals: 6 });

    await expect(svc.balance(scope, net, { contract: USDT })).resolves.toMatchObject({
      address: "0xOWNER",
      token: USDT,
      balance: "5000000",
      symbol: "USDT",
      decimals: 6,
    });
  });

  it("fails the read when the deadline ends the metadata lookup", async () => {
    const expired = new DeadlineExpiredError();
    const gateway = {
      getErc20Balance: async () => "5000000",
      getErc20Metadata: async () => {
        throw expired;
      },
    };
    const timed = new EvmTokenService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      {} as TokenRepository,
    );
    await expect(timed.balance(scope, net, { contract: USDT })).rejects.toBe(expired);
  });

  it("still reports the balance when metadata is unreadable", async () => {
    const { svc } = service({});
    const out = await svc.balance(scope, net, { contract: USDT });

    expect(out.balance).toBe("5000000");
    expect(out.decimals).toBeUndefined();
  });
});

describe("EvmTokenService.add", () => {
  it("stores the chain's symbol and decimals as an erc20 entry", async () => {
    const { svc, added } = service({ symbol: "USDT", decimals: 6, name: "Tether USD" });
    const out = await svc.add(scope, net, { contract: USDT });

    expect(added[0]).toEqual({
      kind: "erc20",
      id: USDT,
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    });
    expect(out).toMatchObject({ network: "eip155:1", action: "added" });
  });

  it("refuses to add a token whose decimals the chain did not report", async () => {
    const { svc, added } = service({ symbol: "USDT" });

    await expect(svc.add(scope, net, { contract: USDT })).rejects.toMatchObject({
      code: "token_metadata_unavailable",
    });
    expect(added).toEqual([]);
  });

  it("refuses to add a token with no readable symbol", async () => {
    const { svc } = service({ decimals: 6 });

    await expect(svc.add(scope, net, { contract: USDT })).rejects.toMatchObject({
      code: "token_metadata_unavailable",
    });
  });

  it("never substitutes a default when decimals is absent", async () => {
    const { svc, added } = service({ symbol: "X" });

    await expect(svc.add(scope, net, { contract: USDT })).rejects.toThrow();
    expect(added.map((e) => e.decimals)).not.toContain(18);
  });
});

describe("EvmTokenService.remove", () => {
  it("removes under the erc20 kind, not a TRON one", async () => {
    const { svc, removed } = service();
    await svc.remove(scope, net, { contract: USDT });

    expect(removed[0]).toEqual(["eip155:1", "wlt_test.0", "erc20", USDT]);
  });
});

describe("EvmTokenService.info", () => {
  it("reports the contract's metadata", async () => {
    const { svc } = service({ symbol: "USDT", decimals: 6, name: "Tether USD" });

    await expect(svc.info(NO_DEADLINE, net, { contract: USDT })).resolves.toMatchObject({
      contract: USDT,
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    });
  });

  it("still reports a token that answers only some of its metadata", async () => {
    const { svc } = service({ decimals: 6 });

    await expect(svc.info(NO_DEADLINE, net, { contract: USDT })).resolves.toMatchObject({
      decimals: 6,
    });
  });

  it("refuses an address that answers none of it, rather than echoing it back", async () => {
    const { svc } = service({});

    await expect(svc.info(NO_DEADLINE, net, { contract: USDT })).rejects.toMatchObject({
      code: "token_metadata_unavailable",
      message: expect.stringContaining("may not be a token contract"),
    });
  });
});
