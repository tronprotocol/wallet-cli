import { describe, expect, it } from "vitest";
import type { NetworkDescriptor, TokenEntry } from "../../domain/types/index.js";
import type { TokenRepository } from "../ports/token-repository.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import { WalletError } from "../../domain/errors/index.js";
import { NATIVE_TRX_ADDRESS } from "../../domain/sunswap/tokens.js";
import { SunSwapTokenResolver, tokenBookAccount, withTokenBook } from "./sunswap-token-resolver.js";

const NETWORK = { id: "tron:728126428", family: "tron" } as unknown as NetworkDescriptor;
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const SUN = "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S";
const FAKE_USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const OTHER = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";
const ACCOUNT = "wlt_main.0";

const trc20 = (id: string, symbol: string): TokenEntry => ({
  kind: "trc20",
  id,
  symbol,
  decimals: 6,
});

/** A book with an official layer and one user layer, keyed by account like the real one. */
function book(user: TokenEntry[] = []): TokenRepository {
  const official = [trc20(USDT, "USDT")];
  return {
    official: () => official,
    effective: (_network: string, account: string) => [
      ...official.map((token) => ({ ...token, source: "official" as const })),
      ...(account === ACCOUNT ? user : []).map((token) => ({ ...token, source: "user" as const })),
    ],
    add: () => "added",
    remove: () => official[0]!,
  };
}

const resolver = (user: TokenEntry[] = []) =>
  new SunSwapTokenResolver(book(user), { tron: "tron:728126428" });

describe("the user layer", () => {
  it("resolves a symbol the user added for swap, and says where it came from", () => {
    expect(
      resolver([trc20(SUN, "SUN")]).resolveToken(NETWORK, "sun", {
        caller: "swap",
        account: ACCOUNT,
      }),
    ).toEqual({ address: SUN, fromTokenBook: true });
  });

  it("resolves it for the liquidity commands too", () => {
    expect(
      resolver([trc20(SUN, "SUN")]).resolve(NETWORK, "SUN", {
        caller: "liquidity",
        account: ACCOUNT,
      }),
    ).toBe(SUN);
  });

  it("marks an official symbol as not from the token book", () => {
    expect(resolver().resolveToken(NETWORK, "USDT", { caller: "swap", account: ACCOUNT })).toEqual({
      address: USDT,
      fromTokenBook: false,
    });
  });

  it("reads only the official layer with no account", () => {
    expect(() => resolver([trc20(SUN, "SUN")]).resolve(NETWORK, "SUN", { caller: "swap" })).toThrow(
      expect.objectContaining({ code: "unsupported_token" }),
    );
  });

  // price and pool-list take no account, so even if one were passed the user layer is not theirs.
  it.each(["price", "pool-list"] as const)("%s ignores the user layer", (caller) => {
    expect(() =>
      resolver([trc20(SUN, "SUN")]).resolve(NETWORK, "SUN", { caller, account: ACCOUNT }),
    ).toThrow(expect.objectContaining({ code: "unsupported_token" }));
  });

  it("does not offer a user TRC-10 entry as a candidate", () => {
    const trc10: TokenEntry = { kind: "trc10", id: "1002000", symbol: "SUN", decimals: 6 };
    expect(() =>
      resolver([trc10]).resolve(NETWORK, "SUN", { caller: "swap", account: ACCOUNT }),
    ).toThrow(expect.objectContaining({ code: "unsupported_token" }));
  });
});

describe("ambiguous symbols", () => {
  it("refuses an official and a user entry with the same symbol, naming both", () => {
    const attempt = () =>
      resolver([trc20(FAKE_USDT, "usdt")]).resolve(NETWORK, "USDT", {
        caller: "swap",
        account: ACCOUNT,
      });
    expect(attempt).toThrow(expect.objectContaining({ code: "ambiguous_token_symbol" }));
    expect(attempt).toThrow(USDT);
    expect(attempt).toThrow(FAKE_USDT);
  });

  it("refuses two user entries with the same symbol", () => {
    const attempt = () =>
      resolver([trc20(SUN, "SUN"), trc20(OTHER, "SUN")]).resolve(NETWORK, "SUN", {
        caller: "liquidity",
        account: ACCOUNT,
      });
    expect(attempt).toThrow(expect.objectContaining({ code: "ambiguous_token_symbol" }));
    expect(attempt).toThrow(SUN);
    expect(attempt).toThrow(OTHER);
  });
});

describe("builtins and addresses", () => {
  it("keeps TRX builtin even when the user layer has an entry named TRX", () => {
    expect(
      resolver([trc20(OTHER, "TRX")]).resolve(NETWORK, "trx", { caller: "swap", account: ACCOUNT }),
    ).toBe(NATIVE_TRX_ADDRESS);
  });

  it("passes an address through", () => {
    expect(resolver().resolveToken(NETWORK, ` ${SUN} `, { caller: "swap" })).toEqual({
      address: SUN,
      fromTokenBook: false,
    });
  });
});

describe("the not-found hint", () => {
  it.each([
    ["swap", "pass its contract address in its place, or add it with 'wallet-cli token add'"],
    [
      "liquidity",
      "pass its contract address with --token0/--token1, or add it with 'wallet-cli token add'",
    ],
    ["pool-list", "pass its contract address with --token"],
    ["price", "pass its contract address with --address"],
  ] as const)("%s says how to name the token", (caller, hint) => {
    expect(() => resolver().resolve(NETWORK, "UNKNOWN", { caller })).toThrow(
      `unknown token symbol UNKNOWN on tron; ${hint}`,
    );
  });

  it.each(["price", "pool-list"] as const)("%s does not suggest token add", (caller) => {
    expect(() => resolver().resolve(NETWORK, "UNKNOWN", { caller })).not.toThrow("token add");
  });
});

describe("tokenBookAccount", () => {
  it("is the account the command uses", () => {
    expect(tokenBookAccount({ activeAccount: ACCOUNT } as unknown as AccountScope)).toBe(ACCOUNT);
  });

  it("is undefined when there is no account at all", () => {
    const scope = {
      get activeAccount(): string {
        throw new WalletError("missing_wallet_address", "no active account");
      },
    } as unknown as AccountScope;
    expect(tokenBookAccount(scope)).toBeUndefined();
  });
});

describe("withTokenBook", () => {
  it("adds nothing when every side is official", () => {
    expect(withTokenBook({ a: 1 }, [{ address: USDT, fromTokenBook: false }])).toEqual({ a: 1 });
  });

  it("lists the addresses that came from the token book", () => {
    expect(
      withTokenBook({ a: 1 }, [
        { address: SUN, fromTokenBook: true },
        undefined,
        { address: USDT, fromTokenBook: false },
      ]),
    ).toEqual({ a: 1, fromTokenBook: [SUN] });
  });
});
