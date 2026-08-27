/**
 * TokenBookService — the address-book reads that touch no chain.
 *
 * `token list` only merges the official and user layers for a (network, account) pair, which is
 * the same operation on every family. Keeping one implementation is what stops the two families'
 * listings from drifting apart in shape.
 */
import { describe, it, expect } from "vitest";
import { TokenBookService } from "./token-book-service.js";
import type { TokenRepository } from "../ports/token-repository.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import type { EffectiveTokenEntry, NetworkDescriptor } from "../../domain/types/index.js";

const scope: AccountScope = { activeAccount: "wlt_test.0", resolveAddress: () => "0xADDR" };
const net = { id: "evm:1", family: "evm", nativeSymbol: "ETH" } as NetworkDescriptor;

const USDT: EffectiveTokenEntry = {
  kind: "erc20",
  id: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  symbol: "USDT",
  decimals: 6,
  source: "official",
};

function repo(entries: EffectiveTokenEntry[]) {
  const calls: Array<[string, string]> = [];
  const repository = {
    effective: (networkId: string, account: string) => {
      calls.push([networkId, account]);
      return entries;
    },
  } as unknown as TokenRepository;
  return { repository, calls };
}

describe("TokenBookService.list", () => {
  it("returns the book for the selected network and active account", () => {
    const { repository, calls } = repo([USDT]);

    expect(new TokenBookService(repository).list(scope, net)).toEqual({
      network: "evm:1",
      account: "wlt_test.0",
      tokens: [USDT],
    });
    expect(calls).toEqual([["evm:1", "wlt_test.0"]]);
  });

  it("reports an empty book rather than failing", () => {
    expect(new TokenBookService(repo([]).repository).list(scope, net).tokens).toEqual([]);
  });

  it("reads no chain state at all", () => {
    // No gateway is injected: if listing ever needed one, this would not compile or construct.
    expect(() => new TokenBookService(repo([]).repository)).not.toThrow();
  });
});
