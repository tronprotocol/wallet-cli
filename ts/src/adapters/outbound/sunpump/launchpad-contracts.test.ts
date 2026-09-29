import { describe, expect, it, vi } from "vitest";
import {
  createLaunchpadBuyAction,
  createLaunchpadSellAction,
  LaunchpadTokenState,
  MAX_UINT256,
} from "@sun-protocol/sun-sdk-launchpad";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { LAUNCHPAD_STATE } from "../../../domain/sunpump/curve.js";
import { SunPumpLaunchpadContracts } from "./launchpad-contracts.js";

const LAUNCHPAD = "TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw";
const TOKEN = "TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E";

const NETWORK = {
  id: "tron:728126428",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "728126428",
  sunpump: { launchpad: LAUNCHPAD },
} as unknown as NetworkDescriptor;

const uint = (value: bigint | number) => BigInt(value).toString(16).padStart(64, "0");

function gatewayAnswering(answers: Record<string, string>) {
  return {
    get: () => ({
      triggerConstantContract: vi.fn(async (contract: string, method: string) => {
        const answer = answers[method];
        if (answer === undefined) throw new Error(`unscripted call ${contract}:${method}`);
        return [answer];
      }),
    }),
  } as unknown as ChainGatewayProvider;
}

/**
 * The reason our enum is not a transcription.
 *
 * Upstream's had three values and reported a launched token's `3` as something else, which would
 * let it through to a transaction that must revert. Ours must agree with the SDK's exactly, and
 * this is the assertion that says so rather than a comment claiming it.
 */
describe("the curve states we recognise", () => {
  it("are exactly the SDK's", () => {
    expect(LAUNCHPAD_STATE.NOT_EXIST).toBe(LaunchpadTokenState.NOT_EXIST);
    expect(LAUNCHPAD_STATE.TRADING).toBe(LaunchpadTokenState.TRADING);
    expect(LAUNCHPAD_STATE.READY_TO_LAUNCH).toBe(LaunchpadTokenState.READY_TO_LAUNCH);
    expect(LAUNCHPAD_STATE.LAUNCHED).toBe(LaunchpadTokenState.LAUNCHED);
  });
});

describe("tokenState", () => {
  it.each([
    [0, LAUNCHPAD_STATE.NOT_EXIST],
    [1, LAUNCHPAD_STATE.TRADING],
    [2, LAUNCHPAD_STATE.READY_TO_LAUNCH],
    [3, LAUNCHPAD_STATE.LAUNCHED],
  ])("reads %i from the contract", async (raw, expected) => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({ "getTokenState(address)": uint(raw) }),
    );
    await expect(port.tokenState(NETWORK, TOKEN)).resolves.toBe(expected);
  });

  /**
   * A value we do not recognise is an error, not a guess.
   *
   * The enum already grew from three to four once. Treating an unknown fifth as tradeable is how
   * a token in a state nobody has seen gets a transaction that must fail.
   */
  it("refuses a state this release does not know rather than assuming it can trade", async () => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({ "getTokenState(address)": uint(4) }),
    );
    await expect(port.tokenState(NETWORK, TOKEN)).rejects.toMatchObject({
      code: "provider_error",
      message: expect.stringContaining("state 4"),
    });
  });
});

describe("quotes", () => {
  // The fee is the second word, and it is inside the TRX the caller named — not added to it.
  it("reads the token amount and the platform fee out of one buy quote", async () => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({
        "getTokenAmountByPurchaseWithFee(address,uint256)": `${uint(25125337148664452174594n)}${uint(10000n)}`,
      }),
    );
    await expect(port.quoteBuy(NETWORK, TOKEN, "1000000")).resolves.toEqual({
      tokenAmount: "25125337148664452174594",
      feeSun: "10000",
    });
  });

  it("reads the gross TRX and the fee out of one sell quote", async () => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({
        "getTrxAmountBySaleWithFee(address,uint256)": `${uint(39401n)}${uint(10000n)}`,
      }),
    );
    await expect(port.quoteSell(NETWORK, TOKEN, "1000")).resolves.toEqual({
      trxAmountSun: "39401",
      feeSun: "10000",
    });
  });

  // Past what a double holds, which is why every amount here is a string.
  it("keeps a 23-digit token amount exact", async () => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({
        "getTokenAmountByPurchaseWithFee(address,uint256)": `${uint(25125337148664452174594n)}${uint(0n)}`,
      }),
    );
    const quote = await port.quoteBuy(NETWORK, TOKEN, "1000000");
    expect(quote.tokenAmount).toBe("25125337148664452174594");
    expect(Number(quote.tokenAmount).toString()).not.toBe(quote.tokenAmount);
  });
});

describe("the floor", () => {
  const port = new SunPumpLaunchpadContracts(gatewayAnswering({}));

  it("is the SDK's integer arithmetic", () => {
    expect(port.applyFloor("1000000", 500)).toBe("950000");
    expect(port.applyFloor("25125337148664452174594", 500)).toBe("23869070291231229565864");
  });

  // 25125337148664452174594 * 9999 / 10000, worked by hand. A double would round the input
  // itself before the multiplication ever happened.
  it("stays exact past float precision", () => {
    expect(port.applyFloor("25125337148664452174594", 1)).toBe("25122824614949585729376");
  });
});

describe("payloads", () => {
  const port = new SunPumpLaunchpadContracts(gatewayAnswering({}));

  /**
   * The signature and the parameter order come from the SDK, not from this file. Asserting them
   * here is what would catch an SDK rename before it became a wrong call on chain.
   */
  it("builds a buy with TRX as the call value and the minimum as an argument", () => {
    const payload = port.buyPayload(NETWORK, {
      token: TOKEN,
      trxSun: "1000000",
      minTokenAmount: "23869070291231229565864",
    });
    expect(payload).toEqual({
      target: LAUNCHPAD,
      method: "purchaseToken(address,uint256)",
      parameters: [
        { type: "address", value: TOKEN },
        { type: "uint256", value: "23869070291231229565864" },
      ],
      callValueSun: "1000000",
    });
  });

  it("builds a sale with the amount and the floor, and no call value", () => {
    const payload = port.sellPayload(NETWORK, {
      token: TOKEN,
      tokenAmount: "1000000000000000000000",
      minTrxSun: "29401",
    });
    expect(payload).toEqual({
      target: LAUNCHPAD,
      method: "saleToken(address,uint256,uint256)",
      parameters: [
        { type: "address", value: TOKEN },
        { type: "uint256", value: "1000000000000000000000" },
        { type: "uint256", value: "29401" },
      ],
    });
    expect(payload.callValueSun).toBeUndefined();
  });

  /**
   * The guard that exists because the SDK's parameter values are optional in its own types.
   *
   * A missing minimum would encode as an empty parameter — and a trade whose floor never arrived
   * is a trade with no slippage protection, which succeeds and looks entirely normal.
   */
  it("refuses an action the SDK built with an empty parameter", () => {
    const action = createLaunchpadBuyAction({
      launchpad: LAUNCHPAD,
      token: TOKEN,
      trxAmount: "1000000",
      minTokenOut: undefined as unknown as string,
    });
    expect(action.parameters?.[1]?.value).toBeUndefined();
    expect(() =>
      port.buyPayload(NETWORK, {
        token: TOKEN,
        trxSun: "1000000",
        minTokenAmount: undefined as unknown as string,
      }),
    ).toThrow(/empty uint256 parameter/);
  });

  it("uses the SDK's own signature for a sale, not a retyped one", () => {
    const action = createLaunchpadSellAction({
      launchpad: LAUNCHPAD,
      token: TOKEN,
      tokenAmount: "1",
      minTrxOut: "1",
    });
    expect(
      port.sellPayload(NETWORK, { token: TOKEN, tokenAmount: "1", minTrxSun: "1" }).method,
    ).toBe(action.functionSelector);
  });

  // The one path in this codebase where unbounded is correct: the curve pulls tokens on every
  // sale, and the contract is an upgradeable proxy that expects a standing allowance.
  it("takes the unlimited amount from the SDK rather than writing out 2^256-1", () => {
    expect(SunPumpLaunchpadContracts.UNLIMITED).toBe(MAX_UINT256.toString());
    expect(SunPumpLaunchpadContracts.UNLIMITED).toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    );
  });
});

describe("network availability", () => {
  it("refuses a network with no launchpad configured", () => {
    const port = new SunPumpLaunchpadContracts(gatewayAnswering({}));
    const nile = { ...NETWORK, sunpump: undefined } as unknown as NetworkDescriptor;
    expect(() => port.launchpadAddress(nile)).toThrow(/no SunPump launchpad configured/);
  });
});
