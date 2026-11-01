import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { describe, it, expect, vi, beforeEach } from "vitest";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const planRouterPermit2Authorization = vi.fn();

vi.mock("@sun-protocol/sun-sdk-protocols", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  planRouterPermit2Authorization: (...args: unknown[]) => planRouterPermit2Authorization(...args),
}));

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
