/**
 * EvmTokenService — the ERC-20 half of the `token` group.
 *
 * `token add` is the single point where a token's decimals are checked against the chain: once an
 * entry is in the book, `tx send --token SYMBOL` takes its contract and decimals verbatim and
 * never asks the chain again. So a missing `decimals` has to be refused here, while a symbol the
 * contract spells in the legacy `bytes32` form must not cost the user the entry.
 */
import { describe, it, expect } from "vitest";
import { EvmTokenService } from "./token-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { NetworkDescriptor, TokenEntry } from "../../../domain/types/index.js";

const scope: AccountScope = { activeAccount: "wlt_test.0", resolveAddress: () => "0xOWNER" };
const net = { id: "evm:1", family: "evm", nativeSymbol: "ETH" } as NetworkDescriptor;
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
    expect(out).toMatchObject({ network: "evm:1", action: "added" });
  });

  // The load-bearing rule: `tx send --token` trusts this number for every later transfer.
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

    expect(removed[0]).toEqual(["evm:1", "wlt_test.0", "erc20", USDT]);
  });
});

describe("EvmTokenService.info", () => {
  it("reports the contract's metadata", async () => {
    const { svc } = service({ symbol: "USDT", decimals: 6, name: "Tether USD" });

    await expect(svc.info(net, { contract: USDT })).resolves.toMatchObject({
      contract: USDT,
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    });
  });

  /**
   * Metadata is read best-effort, so a thin token still reports. But a contract that answers
   * NOTHING is not a token with thin metadata — it is not a token, and `{contract}` alone under
   * `success` reads as "this token has no metadata". `add` and `balance` already refuse the same
   * address; this is the third command agreeing with them.
   */
  it("still reports a token that answers only some of its metadata", async () => {
    const { svc } = service({ decimals: 6 });

    await expect(svc.info(net, { contract: USDT })).resolves.toMatchObject({ decimals: 6 });
  });

  it("refuses an address that answers none of it, rather than echoing it back", async () => {
    const { svc } = service({});

    await expect(svc.info(net, { contract: USDT })).rejects.toMatchObject({
      code: "token_metadata_unavailable",
      message: expect.stringContaining("may not be a token contract"),
    });
  });
});
