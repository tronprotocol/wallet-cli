import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeadlineExpiredError } from "../../../application/contracts/deadline.js";
import { ChainError } from "../../../domain/errors/index.js";
import { expiredCheck } from "../http/__test-support__/dispatch.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const planRouterPermit2Authorization = vi.fn();

// Encode with the real materializer; only its chain clock is fixed.
const CHAIN_TIME_MS = 1_700_000_000_000;

vi.mock("@sun-protocol/sun-sdk-protocols", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@sun-protocol/sun-sdk-protocols")>();
  return {
    ...sdk,
    planRouterPermit2Authorization: (...args: unknown[]) => planRouterPermit2Authorization(...args),
    materializeUniversalRouterAction: (context: object, action: never, completed: never) =>
      sdk.materializeUniversalRouterAction(
        { ...context, getTransactionTime: async () => CHAIN_TIME_MS } as never,
        action,
        completed,
      ),
  };
});

const { SunSwapRouterPlanner } = await import("./router-plan.js");

const NILE = { id: "tron:3448148188", family: "tron" } as never;
const gateways = { get: () => ({}) } as never;
const INPUT = {
  owner: "TOwner",
  token: "TToken",
  spender: "TSpender",
  amount: "1000",
  ttlSeconds: 600,
};
const TYPES = {
  EIP712Domain: [{ name: "name", type: "string" }],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
};

function plannedWith(typedData: unknown): void {
  planRouterPermit2Authorization.mockResolvedValue({
    mode: "typed-data",
    actions: [{ type: "typed-data-signature", typedData }],
    permitSingle: { details: { amount: 1000n, expiration: 1n } },
  });
}

describe("SunSwapRouterPlanner.planPermit typed data", () => {
  beforeEach(() => planRouterPermit2Authorization.mockReset());

  it("returns the planner's typed data in normalized form", async () => {
    plannedWith({
      domain: { name: "Permit2", chainId: 3448148188n },
      types: TYPES,
      primaryType: "PermitSingle",
      message: { details: { amount: 1000n }, spender: "TSpender", sigDeadline: 1n },
    });

    const plan = await new SunSwapRouterPlanner(gateways).planPermit(NILE, INPUT, NO_CHECK);

    expect(plan?.typedData.primaryType).toBe("PermitSingle");
    expect(Object.keys(plan!.typedData.types)).toEqual(["PermitDetails", "PermitSingle"]);
  });

  it.each([
    ["no typed data", undefined],
    ["a non-object domain", { domain: "x", types: TYPES, message: {} }],
    ["a message with a non-JSON member", { domain: {}, types: TYPES, message: { f: () => 1 } }],
  ])("reports %s from the planner as provider_error", async (_label, typedData) => {
    plannedWith(typedData);

    await expect(
      new SunSwapRouterPlanner(gateways).planPermit(NILE, INPUT, NO_CHECK),
    ).rejects.toMatchObject({
      code: "provider_error",
      message: expect.stringMatching(/^the Permit2 planner returned malformed typed data: /),
    });
  });
});

describe("SunSwapRouterPlanner.planPermit SDK failures", () => {
  beforeEach(() => {
    planRouterPermit2Authorization.mockReset();
  });

  it.each([
    ["before its request was sent", new DeadlineExpiredError()],
    ["after its request was sent", new ChainError("timeout", "the node did not answer in time")],
  ])("keeps a deadline failure %s as timeout", async (_label, error) => {
    planRouterPermit2Authorization.mockRejectedValue(error);

    await expect(
      new SunSwapRouterPlanner(gateways).planPermit(NILE, INPUT, NO_CHECK),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports an unclassified SDK error as provider_error", async () => {
    planRouterPermit2Authorization.mockRejectedValue(new Error("boom"));

    await expect(
      new SunSwapRouterPlanner(gateways).planPermit(NILE, INPUT, NO_CHECK),
    ).rejects.toMatchObject({ code: "provider_error" });
  });
});

describe("SunSwapRouterPlanner.buildSwapCall floor", () => {
  const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
  const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  const ROUTE = {
    amountIn: "1",
    amountInRaw: "1000000",
    amountOut: "0.343446",
    amountOutRaw: "343446",
    tokens: [TRX, USDT],
    symbols: ["TRX", "USDT"],
    poolFees: ["0", "0"],
    poolVersions: ["v2"],
    poolKeys: [],
    stepAmountsOut: ["343446"],
  };

  it("encodes the requested minimum exactly, not one derived from the quote", async () => {
    const call = await new SunSwapRouterPlanner(gateways).buildSwapCall(
      NILE,
      {
        route: ROUTE,
        amountOutMinimum: "300001",
        recipient: TRX,
        validForSeconds: 1800,
        feeLimitSun: "100000000",
      },
      NO_CHECK,
    );

    const inputs = (call.parameters[1]!.value as string[]).join("");
    expect(inputs).toContain(BigInt(300001).toString(16).padStart(64, "0"));
    expect(inputs).not.toContain(BigInt(343446).toString(16).padStart(64, "0"));
  });
});

describe("SunSwapRouterPlanner.transactionTime clock request", () => {
  afterEach(() => vi.unstubAllGlobals());

  function timeService() {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 0, data: { serverTimeStamp: CHAIN_TIME_MS } })),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("reads the chain time from the time service", async () => {
    const fetch = timeService();

    await expect(new SunSwapRouterPlanner(gateways).transactionTime(NILE, NO_CHECK)).resolves.toBe(
      CHAIN_TIME_MS / 1000,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends no clock request once the command deadline has passed", async () => {
    const fetch = timeService();

    await new SunSwapRouterPlanner(gateways).transactionTime(NILE, expiredCheck());

    expect(fetch).not.toHaveBeenCalled();
  });
});
