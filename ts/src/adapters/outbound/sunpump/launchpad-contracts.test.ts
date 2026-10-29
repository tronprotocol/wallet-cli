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
import { sunAmount, baseUnitAmount, type BaseUnits } from "../../../domain/amounts/index.js";

const LAUNCHPAD = "TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw";
const TOKEN = "TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E";

const NETWORK = {
  id: "tron:728126428",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "728126428",
  sunpump: { curve: true },
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
  it("reads the token amount and the platform fee out of one buy quote", async () => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({
        "getTokenAmountByPurchaseWithFee(address,uint256)": `${uint(25125337148664452174594n)}${uint(10000n)}`,
      }),
    );
    await expect(port.quoteBuy(NETWORK, TOKEN, sunAmount("1000000"))).resolves.toEqual({
      tokenAmount: "25125337148664452174594",
      feeSun: "10000",
    });
  });

  it("reads the seller's net TRX and the fee out of one sell quote, as quoted", async () => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({
        "getTrxAmountBySaleWithFee(address,uint256)": `${uint(22728n)}${uint(10000n)}`,
      }),
    );
    await expect(port.quoteSell(NETWORK, TOKEN, baseUnitAmount("1000"))).resolves.toEqual({
      trxAmountSun: "22728",
      feeSun: "10000",
    });
  });

  it("finds the minimum sale from the inverse quote for one SUN of proceeds", async () => {
    const triggerConstantContract = vi.fn(
      async (_contract: string, method: string, parameters: { value: unknown }[]) => {
        if (method !== "getExactTrxAmountForSaleWithFee(address,uint256)") {
          throw new Error(`unscripted call ${method}`);
        }
        expect(parameters[1]!.value).toBe("1");
        return [`${uint(292065903216294733861n)}${uint(10000n)}`];
      },
    );
    const port = new SunPumpLaunchpadContracts({
      get: () => ({ triggerConstantContract }),
    } as unknown as ChainGatewayProvider);
    await expect(port.minimumSellAmount(NETWORK, TOKEN)).resolves.toBe("292065903216294733861");
    expect(triggerConstantContract).toHaveBeenCalledTimes(1);
  });

  it("keeps a 23-digit token amount exact", async () => {
    const port = new SunPumpLaunchpadContracts(
      gatewayAnswering({
        "getTokenAmountByPurchaseWithFee(address,uint256)": `${uint(25125337148664452174594n)}${uint(0n)}`,
      }),
    );
    const quote = await port.quoteBuy(NETWORK, TOKEN, sunAmount("1000000"));
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

  it("stays exact past float precision", () => {
    expect(port.applyFloor("25125337148664452174594", 1)).toBe("25122824614949585729376");
  });
});

describe("payloads", () => {
  const port = new SunPumpLaunchpadContracts(gatewayAnswering({}));

  it("builds a buy with TRX as the call value and the minimum as an argument", () => {
    const payload = port.buyPayload(NETWORK, {
      token: TOKEN,
      trxSun: sunAmount("1000000"),
      minTokenAmount: baseUnitAmount("23869070291231229565864"),
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
      tokenAmount: baseUnitAmount("1000000000000000000000"),
      minTrxSun: sunAmount("29401"),
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
        trxSun: sunAmount("1000000"),
        minTokenAmount: undefined as unknown as BaseUnits,
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
      port.sellPayload(NETWORK, {
        token: TOKEN,
        tokenAmount: baseUnitAmount("1"),
        minTrxSun: sunAmount("1"),
      }).method,
    ).toBe(action.functionSelector);
  });

  it("takes the unlimited amount from the SDK rather than writing out 2^256-1", () => {
    expect(SunPumpLaunchpadContracts.UNLIMITED).toBe(MAX_UINT256.toString());
    expect(SunPumpLaunchpadContracts.UNLIMITED).toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    );
  });
});

describe("network availability", () => {
  it("takes the launchpad from the SDK where the curve is switched on", () => {
    const port = new SunPumpLaunchpadContracts(gatewayAnswering({}));
    expect(port.launchpadAddress(NETWORK)).toBe(LAUNCHPAD);
  });

  it("refuses a network whose curve is off, even though the SDK knows its launchpad", () => {
    const port = new SunPumpLaunchpadContracts(gatewayAnswering({}));
    const nile = {
      ...NETWORK,
      id: "tron:3448148188",
      chainId: "3448148188",
      sunpump: undefined,
    } as unknown as NetworkDescriptor;
    expect(() => port.launchpadAddress(nile)).toThrow(/no SunPump curve enabled/);
  });
});

it.each([78, 255, 9999999999])("rejects unsupported token decimals %i", async (decimals) => {
  const port = new SunPumpLaunchpadContracts(
    gatewayAnswering({ "decimals()": uint(decimals), "symbol()": uint(32) + uint(0) }),
  );
  await expect(port.tokenFacts(NETWORK, TOKEN)).rejects.toMatchObject({
    code: "invalid_node_response",
  });
});
