/**
 * How a V4 pool is named, and the two facts that read as something else.
 *
 * The pool key in `LIVE_HOOKS` is the real mainnet TRX/USDT V4 pool, taken from a router quote's own
 * `poolKey` — so the two traps below are tested against the thing that actually comes back, not
 * against a description of it.
 */
import { describe, expect, it } from "vitest";
import {
  assertSortedPair,
  describeHooks,
  hasHooks,
  resolveV4Pool,
  V4_NO_HOOKS,
} from "./v4-pool.js";
import { NATIVE_TRX_ADDRESS } from "./tokens.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
/** Measured: what that pool's `hooks` field actually contains. */
const LIVE_HOOKS = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

describe("no hooks is spelled with the address that also means TRX", () => {
  /**
   * The trap. That string is the base58 zero address, which on TRON is also the address the market
   * API uses for native TRX. A pool whose `hooks` reads it has NO hook — it is not hooked to TRX.
   */
  it("reads the live pool's hooks field as absence, not as a contract", () => {
    expect(LIVE_HOOKS).toBe(NATIVE_TRX_ADDRESS);
    expect(hasHooks(LIVE_HOOKS)).toBe(false);
    expect(describeHooks(LIVE_HOOKS)).toBe("none");
  });

  // And it must not print that address at a reader, which would teach them the pool is hooked to
  // the chain's own coin.
  it("never shows the zero address where a hook would go", () => {
    expect(describeHooks(V4_NO_HOOKS)).not.toContain("T9yD14");
  });

  it("reports a real hook as itself", () => {
    expect(hasHooks(USDT)).toBe(true);
    expect(describeHooks(USDT)).toBe(USDT);
  });
});

describe("naming a pool by its parts", () => {
  /**
   * The five parts, and the fourth is the one this used to be missing.
   *
   * A V4 pool was named here by its 32-byte pool id — a value this CLI published nowhere. It is
   * named by what it is made of now, which is also how `--create-pool` already named one, through
   * the same builder.
   */
  const existing = {
    token0: NATIVE_TRX_ADDRESS,
    token1: USDT,
    fee: 500,
    tickSpacing: 10,
  };

  it("takes the pair, the fee and the spacing, and defaults the hook to none", () => {
    expect(resolveV4Pool(existing)).toEqual({
      kind: "existing",
      token0: NATIVE_TRX_ADDRESS,
      token1: USDT,
      fee: 500,
      tickSpacing: 10,
      hooks: V4_NO_HOOKS,
    });
  });

  it("takes a hook when the pool has one", () => {
    expect(resolveV4Pool({ ...existing, hooks: USDT })).toMatchObject({ hooks: USDT });
  });

  /**
   * THE REFUSAL THIS VERSION EXISTS FOR.
   *
   * A V4 tick spacing is NOT implied by the fee tier. Measured on Nile: USDC/USDT at fee 500 has
   * spacing 12 and TRX/USDT at fee 500 has spacing 10. Defaulting it from V3's table would compute a
   * different pool key, and when that pool exists the deposit lands in a market nobody named.
   */
  it("requires --tick-spacing and says a fee tier does not fix it", () => {
    expect(() => resolveV4Pool({ ...existing, tickSpacing: undefined })).toThrow(
      /--tick-spacing is required on V4 and has no default.*SAME fee tier.*different tick spacings/s,
    );
    expect(() => resolveV4Pool({ ...existing, tickSpacing: undefined })).toThrow(
      expect.objectContaining({ code: "missing_option" }),
    );
  });

  it.each([
    ["--token0", { ...existing, token0: undefined }, /--token0 is required on V4/],
    ["--token1", { ...existing, token1: undefined }, /--token1 is required on V4/],
    ["--fee", { ...existing, fee: undefined }, /--fee is required on V4/],
  ])("requires %s", (_name, input, message) => {
    expect(() => resolveV4Pool(input)).toThrow(message);
    expect(() => resolveV4Pool(input)).toThrow(expect.objectContaining({ code: "missing_option" }));
  });

  // A price belongs to a pool being created. On an existing one it would be silently discarded,
  // which is how a caller comes to believe they set something.
  it("refuses --sqrt-price without --create-pool", () => {
    expect(() => resolveV4Pool({ ...existing, sqrtPrice: "1" })).toThrow(
      /only accepted with --create-pool/,
    );
  });

  /**
   * A SYMBOL IS NOT AN ADDRESS YET, and the pair order cannot be judged on one.
   *
   * `--token0 TRX --create-pool` used to fail with `invalid --pool: Invalid checksum` — a flag the
   * caller never passed and a cause that was not the problem — because the byte comparison ran on
   * the symbol. The order is checked once both sides are addresses; the use case runs this again
   * after resolving them.
   */
  it("passes a symbol through rather than decoding it as an address", () => {
    expect(() => resolveV4Pool({ ...existing, token0: "TRX", token1: "USDT" })).not.toThrow();
    expect(resolveV4Pool({ ...existing, token0: "TRX", token1: "USDT" })).toMatchObject({
      token0: "TRX",
      token1: "USDT",
    });
  });
});

describe("creating a pool", () => {
  const creation = {
    createPool: true,
    sqrtPrice: "79228162514264337593543950336",
    token0: NATIVE_TRX_ADDRESS,
    token1: USDT,
    fee: 500,
    tickSpacing: 10,
  };

  it("takes the pair, the fee, the spacing and the starting price", () => {
    expect(resolveV4Pool(creation)).toEqual({
      kind: "create",
      token0: NATIVE_TRX_ADDRESS,
      token1: USDT,
      fee: 500,
      tickSpacing: 10,
      sqrtPriceX96: "79228162514264337593543950336",
      hooks: V4_NO_HOOKS,
    });
  });

  // TRX is passed through as NATIVE. V2 and V3 both wrap, so the guess from V3 is wrong, and a
  // wrapped pair names a pool that also exists — the WTRX one — rather than failing.
  it("keeps native TRX native rather than wrapping it", () => {
    const target = resolveV4Pool(creation);
    expect(target.kind === "create" && target.token0).toBe(NATIVE_TRX_ADDRESS);
  });

  it("defaults the hook to none rather than inventing one", () => {
    const target = resolveV4Pool(creation);
    expect(target.kind === "create" && target.hooks).toBe(V4_NO_HOOKS);
    expect(target.kind === "create" && hasHooks(target.hooks)).toBe(false);
  });

  it.each([
    ["--sqrt-price", { ...creation, sqrtPrice: undefined }, /--sqrt-price is required/],
    ["--token0", { ...creation, token0: undefined }, /--token0 is required on V4/],
    ["--token1", { ...creation, token1: undefined }, /--token1 is required on V4/],
    ["--fee", { ...creation, fee: undefined }, /--fee is required on V4/],
    ["--tick-spacing", { ...creation, tickSpacing: undefined }, /--tick-spacing is required on V4/],
  ])("refuses a creation missing %s", (_name, input, message) => {
    expect(() => resolveV4Pool(input)).toThrow(message);
  });

  /**
   * ONE KEY BUILDER, not two that agree.
   *
   * A creation and a deposit into an existing pool are named by exactly the same five parts. If they
   * were assembled separately, the pool a caller created and the pool they later deposited into
   * could drift apart — and the drift would be invisible, because both would be valid keys.
   */
  it("builds the same key as an existing pool from the same flags", () => {
    const { kind, sqrtPriceX96, ...created } = resolveV4Pool(creation) as never as Record<
      string,
      unknown
    >;
    expect(kind).toBe("create");
    expect(sqrtPriceX96).toBe(creation.sqrtPrice);
    const { kind: otherKind, ...existing } = resolveV4Pool({
      token0: creation.token0,
      token1: creation.token1,
      fee: creation.fee,
      tickSpacing: creation.tickSpacing,
    }) as never as Record<string, unknown>;
    expect(otherKind).toBe("existing");
    expect(created).toEqual(existing);
  });

  /**
   * Q64.96, not a ratio. A caller who types 1.0001 means a price and gets a number the contract
   * would read as almost zero, so the form is stated rather than coerced.
   */
  it.each([["0"], ["1.0001"], ["-1"], ["0x10"]])("refuses %s as a starting price", (value) => {
    expect(() => resolveV4Pool({ ...creation, sqrtPrice: value })).toThrow(/Q64.96 fixed point/);
  });
});

/**
 * The pair's order, which is not cosmetic.
 *
 * A reversed pair hashes to a different pool id AND inverts the starting price, because
 * `--sqrt-price` is the price of the second currency measured in the first. So a reversed creation
 * initialises a pool at the reciprocal of the intended price, reports that price happily, and puts
 * the first deposit entirely on one side. It is refused rather than sorted: sorting silently would
 * leave the caller's price attached to a pair they did not write.
 */
describe("the pair must be in the order V4 requires", () => {
  // Real mainnet addresses, with their 20-byte values, so the expected order is checkable by eye:
  //   TRX  0x0000…0000
  //   JST  0x18fd0626…
  //   WTRX 0x891cdb91…
  //   USDT 0xa614f803…
  const JST = "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9";
  const WTRX = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";

  const creating = (token0: string, token1: string) => ({
    createPool: true,
    sqrtPrice: "79228162514264337593543950336",
    token0,
    token1,
    fee: 500,
    tickSpacing: 10,
  });

  it("accepts a sorted pair", () => {
    expect(() => assertSortedPair(JST, USDT)).not.toThrow();
    expect(() => assertSortedPair(WTRX, USDT)).not.toThrow();
    expect(resolveV4Pool(creating(JST, USDT)).kind).toBe("create");
  });

  it("refuses the same pair reversed, and names the order to use", () => {
    expect(() => assertSortedPair(USDT, JST)).toThrow(
      new RegExp(`pass --token0 ${JST} --token1 ${USDT}`),
    );
  });

  // The reason the refusal exists, stated in the message so the caller knows it is about money.
  it("says the reversed pair would invert the starting price", () => {
    expect(() => assertSortedPair(USDT, JST)).toThrow(/reciprocal of the price you meant/);
  });

  it("refuses a reversed pair through the whole resolution, not just the helper", () => {
    expect(() => resolveV4Pool(creating(USDT, JST))).toThrow(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  // TRX is the zero address, so it sorts before everything and is always currency0.
  it("accepts native TRX as token0", () => {
    expect(() => assertSortedPair(NATIVE_TRX_ADDRESS, USDT)).not.toThrow();
    expect(resolveV4Pool(creating(NATIVE_TRX_ADDRESS, USDT)).kind).toBe("create");
  });

  /**
   * And gives TRX-as-token1 its OWN message. It is not a pair written backwards, it is a pair that
   * cannot exist — telling the caller to swap two tokens would suggest either order was possible.
   */
  it("refuses native TRX as token1 with a message of its own", () => {
    expect(() => assertSortedPair(USDT, NATIVE_TRX_ADDRESS)).toThrow(
      /--token1 cannot be native TRX.*always currency0/s,
    );
    expect(() => assertSortedPair(USDT, NATIVE_TRX_ADDRESS)).not.toThrow(/the wrong way round/);
  });

  // Exit 1, like every other `same_token` in the CLI. The code exists already and must not acquire a
  // second exit class depending on which command raised it.
  it("refuses a pool of one token against itself", () => {
    expect(() => assertSortedPair(USDT, USDT)).toThrow(
      expect.objectContaining({ code: "same_token", kind: "execution" }),
    );
  });

  /**
   * The order is compared on the DECODED 20-byte value, not on the base58 string.
   *
   * The two happen to agree for every TRON address — all 34 characters, and base58's alphabet is in
   * ASCII order — and twenty thousand random pairs showed no disagreement. This case exists so that
   * the equivalence is not what the code depends on: it pins the order against the hex values, which
   * is what the pool key requires.
   */
  it("orders by the address value the pool key uses", () => {
    // JST < WTRX < USDT by value, so every sorted couple is accepted and every reverse refused.
    for (const [low, high] of [
      [JST, WTRX],
      [JST, USDT],
      [WTRX, USDT],
    ] as const) {
      expect(() => assertSortedPair(low, high)).not.toThrow();
      expect(() => assertSortedPair(high, low)).toThrow(/the wrong way round/);
    }
  });
});
