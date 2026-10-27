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
const LIVE_HOOKS = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

describe("no hooks is spelled with the address that also means TRX", () => {
  it("reads the live pool's hooks field as absence, not as a contract", () => {
    expect(LIVE_HOOKS).toBe(NATIVE_TRX_ADDRESS);
    expect(hasHooks(LIVE_HOOKS)).toBe(false);
    expect(describeHooks(LIVE_HOOKS)).toBe("none");
  });

  it("never shows the zero address where a hook would go", () => {
    expect(describeHooks(V4_NO_HOOKS)).not.toContain("T9yD14");
  });

  it("reports a real hook as itself", () => {
    expect(hasHooks(USDT)).toBe(true);
    expect(describeHooks(USDT)).toBe(USDT);
  });
});

describe("naming a pool by its parts", () => {
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

  it("refuses --sqrt-price without --create-pool", () => {
    expect(() => resolveV4Pool({ ...existing, sqrtPrice: "1" })).toThrow(
      /only accepted with --create-pool/,
    );
  });

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

  it.each([["0"], ["1.0001"], ["-1"], ["0x10"]])("refuses %s as a starting price", (value) => {
    expect(() => resolveV4Pool({ ...creation, sqrtPrice: value })).toThrow(/Q64.96 fixed point/);
  });
});

describe("the pair must be in the order V4 requires", () => {
  // Address values sort TRX (0x00...) < JST (0x18...) < WTRX (0x89...) < USDT (0xa6...).
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

  it("says the reversed pair would invert the starting price", () => {
    expect(() => assertSortedPair(USDT, JST)).toThrow(/reciprocal of the price you meant/);
  });

  it("refuses a reversed pair through the whole resolution, not just the helper", () => {
    expect(() => resolveV4Pool(creating(USDT, JST))).toThrow(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("accepts native TRX as token0", () => {
    expect(() => assertSortedPair(NATIVE_TRX_ADDRESS, USDT)).not.toThrow();
    expect(resolveV4Pool(creating(NATIVE_TRX_ADDRESS, USDT)).kind).toBe("create");
  });

  it("refuses native TRX as token1 with a message of its own", () => {
    expect(() => assertSortedPair(USDT, NATIVE_TRX_ADDRESS)).toThrow(
      /--token1 cannot be native TRX.*always currency0/s,
    );
    expect(() => assertSortedPair(USDT, NATIVE_TRX_ADDRESS)).not.toThrow(/the wrong way round/);
  });

  it("refuses a pool of one token against itself", () => {
    expect(() => assertSortedPair(USDT, USDT)).toThrow(
      expect.objectContaining({ code: "same_token", kind: "execution" }),
    );
  });

  it("orders by the address value the pool key uses", () => {
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
