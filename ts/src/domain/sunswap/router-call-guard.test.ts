/**
 * The Universal Router guard, held against a REAL Design-3 call.
 *
 * `CALL` is what `materializeUniversalRouterAction` actually built on mainnet for 100 USDT into
 * TRX, carrying OUR own exact one-hour Permit2 grant rather than the SDK swap planner's unlimited
 * thirty-day one. Nothing in it is hand-written: the inputs are the encoded bytes, the deadline is
 * the deadline, and the floor below is 0.5% under the quote that produced them.
 *
 * Each case then changes one thing. The point of testing against a real call is that the checks
 * have to survive a genuine four-input V2/V3 route mix — a guard tuned to a fixture would pin
 * positions that a different route shape moves.
 */
import { describe, expect, it } from "vitest";
import { assertRouterCallMatches, type RouterCallExpectation } from "./router-call-guard.js";

const ROUTER = "TQqgNg13s2DjvXhW1ky4v6TsR8wZGvb7Y4";
const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";

/** Measured: the encoded inputs of that call, verbatim. */
const INPUTS = [
  "0x000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c0000000000000000000000000000000000000000000000000000000005f5e100000000000000000000000000000000000000000000000000000000006ab4c3820000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a31d689a84244bc01be56e07aeafb7686f56bb89000000000000000000000000000000000000000000000000000000006ab4c38200000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041c78953772f89b8ea211c5f3c2ee134ef1054bfa45326521f1b9b7c0694784056114522aee448e8480dd7ac0e55b5410fa2f6354f2cd1c44d2949e7e071283d3e1c00000000000000000000000000000000000000000000000000000000000000",
  "0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000005f5e100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002ba614f803b6fd780986a42c78ec9c7f77e6ded13c0001f4891cdb91d149f23b1a45d9c5ca78a88d0cb44c18000000000000000000000000000000000000000000",
  "0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000027c5d3a60860342244436a07f15b3b3186225aec000000000000000000000000000000000000000000000000000000001141cee1",
];

const CALL = {
  target: ROUTER,
  functionSelector: "execute(bytes,bytes[],uint256)",
  feeLimit: 100000000,
  parameters: [
    { type: "bytes", value: "0x0a000c04" },
    { type: "bytes[]", value: INPUTS },
    { type: "uint256", value: "1790229628" },
  ],
};

const NOW = 1790227828;

const EXPECT: RouterCallExpectation = {
  router: ROUTER,
  amountIn: "100000000",
  // 0.5% below the 290980375 the route quoted, which is the figure the calldata carries.
  minimumOut: "289525473",
  recipient: OWNER,
  nativeIn: false,
  feeLimit: "100000000",
  notAfter: NOW + 1800,
  now: NOW,
  permit: { amount: "100000000", expiration: "1790231426" },
};

describe("the real call passes", () => {
  it("accepts what the materializer built", () => {
    expect(assertRouterCallMatches(CALL, EXPECT)).toEqual({
      target: ROUTER,
      callValue: "0",
      feeLimit: "100000000",
      deadline: "1790229628",
    });
  });

  // A token input sends no TRX, and the materializer leaves callValue off entirely rather than
  // setting zero. Reading that as "missing" would refuse every token-for-token swap.
  it("reads an absent callValue as zero", () => {
    expect(assertRouterCallMatches(CALL, EXPECT).callValue).toBe("0");
  });
});

describe("what it refuses to send", () => {
  const changed = (call: Partial<typeof CALL>) => ({ ...CALL, ...call });

  it("refuses a call addressed anywhere but the router", () => {
    expect(() =>
      assertRouterCallMatches(changed({ target: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }), EXPECT),
    ).toThrow(/not the router/);
  });

  it("refuses another function on the router", () => {
    expect(() =>
      assertRouterCallMatches(changed({ functionSelector: "execute(bytes,bytes[])" }), EXPECT),
    ).toThrow(/rather than execute\(bytes,bytes\[\],uint256\)/);
  });

  /**
   * 500 TRX is the SDK's default fee limit, five times ours. A call that quietly carried it would
   * succeed and cost five times what the dry run said.
   */
  it("refuses the SDK's default fee limit", () => {
    expect(() => assertRouterCallMatches(changed({ feeLimit: 500000000 }), EXPECT)).toThrow(
      /fee limit is 500000000 SUN and 100000000 was asked for/,
    );
  });

  it("refuses TRX travelling with a token-for-token swap", () => {
    expect(() => assertRouterCallMatches({ ...CALL, callValue: 1n } as never, EXPECT)).toThrow(
      /a token-for-token swap sends none/,
    );
  });

  it("refuses a native swap whose value is not the amount being spent", () => {
    expect(() =>
      assertRouterCallMatches({ ...CALL, callValue: "1" } as never, {
        ...EXPECT,
        nativeIn: true,
      }),
    ).toThrow(/would send 1 SUN as the call's value and this swap spends 100000000/);
  });

  it("refuses a deadline that has already passed", () => {
    expect(() => assertRouterCallMatches(CALL, { ...EXPECT, now: 1790229628 })).toThrow(
      /deadline of 1790229628 has already passed/,
    );
  });

  it("refuses a deadline further out than allowed", () => {
    expect(() => assertRouterCallMatches(CALL, { ...EXPECT, notAfter: 1790229628 - 1 })).toThrow(
      /further out than the/,
    );
  });

  /**
   * The one that matters most: the floor lives inside the encoded inputs, and the route's own
   * amountOutMinimum field is equal to amountOut even when slippage was requested. If the encoder
   * ever stopped applying our bips, this is what notices.
   */
  it("refuses a call that does not carry the minimum we published", () => {
    expect(() => assertRouterCallMatches(CALL, { ...EXPECT, minimumOut: "290980375" })).toThrow(
      /minimum output of 290980375 does not appear anywhere/,
    );
  });

  it("refuses a call that does not carry the amount we are spending", () => {
    expect(() => assertRouterCallMatches(CALL, { ...EXPECT, amountIn: "99999999" })).toThrow(
      /input amount of 99999999 does not appear anywhere/,
    );
  });

  /**
   * A swap that succeeds and pays somebody else is the worst outcome this command has.
   *
   * The expected recipient here is a non-participant — the SunPump launchpad — and that choice is
   * the point. The first version of this case used USDT's address and PASSED, because USDT is the
   * input token and is genuinely in the calldata. Containment is satisfied by any value that is
   * present for another reason, so it can only catch a recipient that is absent entirely, never a
   * recipient swapped for another address the call already mentions.
   */
  it("refuses a call that pays an address the swap does not mention", () => {
    expect(() =>
      assertRouterCallMatches(CALL, { ...EXPECT, recipient: "TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw" }),
    ).toThrow(/recipient TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw does not appear anywhere/);
  });

  it("refuses a call whose permit is not the grant that was signed", () => {
    expect(() =>
      assertRouterCallMatches(CALL, {
        ...EXPECT,
        permit: { amount: "200000000", expiration: "1790231426" },
      }),
    ).toThrow(/permit's amount of 200000000 does not appear anywhere/);
  });

  /**
   * The expiration is compared as a timestamp, and a WRONG timestamp is what this catches. An
   * earlier version of this case expected `1` and passed: the word 1 is in almost any calldata, as
   * an array length or a flag. Containment is only meaningful for a value specific enough not to
   * occur by accident, which a unix second is and a small integer is not.
   */
  it("refuses a permit whose expiration is not the one that was signed", () => {
    expect(() =>
      assertRouterCallMatches(CALL, {
        ...EXPECT,
        permit: { amount: EXPECT.permit!.amount, expiration: "1790231427" },
      }),
    ).toThrow(/permit's expiration of 1790231427 does not appear anywhere/);
  });

  /**
   * The substitution worth naming. A bounded grant widened into an unlimited one between signing
   * and sending would pass every containment check, because our figures would still be there — so
   * the unlimited values are looked for and refused by value.
   */
  it.each([
    ["MAX_UINT160", (2n ** 160n - 1n).toString(), "an unlimited Permit2 grant"],
    ["MAX_UINT256", (2n ** 256n - 1n).toString(), "an unlimited token allowance"],
  ])("refuses a call carrying %s anywhere", (_name, value, label) => {
    const padded = `0x${BigInt(value).toString(16).padStart(64, "0")}`;
    const widened = changed({
      parameters: [
        CALL.parameters[0]!,
        { type: "bytes[]", value: [...INPUTS, padded] },
        CALL.parameters[2]!,
      ],
    });
    expect(() => assertRouterCallMatches(widened, EXPECT)).toThrow(`${label} appears`);
  });

  it("does not look for an unlimited grant when the swap carries no permit", () => {
    const { permit, ...noPermit } = EXPECT;
    void permit;
    const padded = `0x${(2n ** 160n - 1n).toString(16).padStart(64, "0")}`;
    const widened = changed({
      parameters: [
        CALL.parameters[0]!,
        { type: "bytes[]", value: [...INPUTS, padded] },
        CALL.parameters[2]!,
      ],
    });
    // A native-TRX swap needs no permit at all, and MAX_UINT160 in its calldata would be somebody
    // else's business. The check belongs to the permit, not to every call.
    expect(() => assertRouterCallMatches(widened, noPermit)).not.toThrow();
  });

  it("refuses a call with the wrong number of parameters", () => {
    expect(() =>
      assertRouterCallMatches(changed({ parameters: [CALL.parameters[0]!] }), EXPECT),
    ).toThrow(/carries 1 parameters rather than 3/);
  });

  it("fails with router_call_mismatch", () => {
    expect(() => assertRouterCallMatches(changed({ feeLimit: 1 }), EXPECT)).toThrow(
      expect.objectContaining({ code: "router_call_mismatch" }),
    );
  });
});
