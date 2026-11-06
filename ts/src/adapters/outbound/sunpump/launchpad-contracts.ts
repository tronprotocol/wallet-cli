import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import {
  checkedTokenDecimals,
  sunAmount,
  type Sun,
  baseUnitAmount,
  type BaseUnits,
} from "../../../domain/amounts/index.js";
import {
  applySlippageMin,
  createLaunchpadApproveAction,
  createLaunchpadBuyAction,
  createLaunchpadSellAction,
  MAX_UINT256,
  SELECTOR_GET_TOKEN_STATE,
  SELECTOR_QUOTE_BUY_EXACT_TRX,
  SELECTOR_QUOTE_SELL_EXACT_TOKEN,
  SELECTOR_QUOTE_SELL_EXACT_TRX,
  SELECTOR_TRC20_ALLOWANCE,
  SELECTOR_TRC20_BALANCE_OF,
} from "@sun-protocol/sun-sdk-launchpad";
import { getContractAddress } from "@sun-protocol/sun-sdk-chains";
import type { Network } from "@sun-protocol/sun-sdk-core";
import type {
  BuyQuote,
  BuyRequest,
  LaunchpadPort,
  LaunchpadTokenFacts,
  SellQuote,
  SellRequest,
} from "../../../application/ports/sunpump/launchpad.js";
import type { ContractCallPayload } from "../../../application/contracts/tron/tron-contract-call.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import type { LaunchpadState } from "../../../domain/sunpump/curve.js";
import { LAUNCHPAD_STATE } from "../../../domain/sunpump/curve.js";

const SDK_NETWORKS: Readonly<Record<string, Network>> = {
  "tron:728126428": "mainnet",
  "tron:3448148188": "nile",
};

export class SunPumpLaunchpadContracts implements LaunchpadPort {
  readonly approvalDomain = "sunpump-launchpad" as const;

  constructor(private readonly gateways: ChainGatewayProvider) {}

  // Read contract state directly; the HTTP status can be stale.
  async tokenState(
    network: NetworkDescriptor,
    token: string,
    check: DispatchCheck,
  ): Promise<LaunchpadState> {
    const raw = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_GET_TOKEN_STATE,
      [{ type: "address", value: token }],
      check,
    );
    const state = Number(BigInt(`0x${raw.slice(0, 64)}`));
    if (!KNOWN_STATES.has(state)) {
      throw new ChainError(
        "provider_error",
        `the launchpad reported state ${state}, which this release does not recognise`,
      );
    }
    return state as LaunchpadState;
  }

  async tokenFacts(
    network: NetworkDescriptor,
    token: string,
    check: DispatchCheck,
  ): Promise<LaunchpadTokenFacts> {
    const [decimals, symbol] = await Promise.all([
      this.#read(network, token, "decimals()", [], check),
      this.#read(network, token, "symbol()", [], check),
    ]);
    return {
      address: token,
      decimals: checkedTokenDecimals(Number(BigInt(`0x${decimals}`))),
      symbol: decodeString(symbol),
    };
  }

  async balanceOf(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    check: DispatchCheck,
  ): Promise<BaseUnits> {
    const raw = await this.#read(
      network,
      token,
      SELECTOR_TRC20_BALANCE_OF,
      [{ type: "address", value: owner }],
      check,
    );
    return baseUnitAmount(word(raw, 0));
  }

  async allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
    check: DispatchCheck,
  ): Promise<BaseUnits> {
    const raw = await this.#read(
      network,
      token,
      SELECTOR_TRC20_ALLOWANCE,
      [
        { type: "address", value: owner },
        { type: "address", value: spender },
      ],
      check,
    );
    return baseUnitAmount(word(raw, 0));
  }

  // The fee is included in the requested TRX amount.
  async quoteBuy(
    network: NetworkDescriptor,
    token: string,
    trxSun: Sun,
    check: DispatchCheck,
  ): Promise<BuyQuote> {
    const raw = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_QUOTE_BUY_EXACT_TRX,
      [
        { type: "address", value: token },
        { type: "uint256", value: trxSun },
      ],
      check,
    );
    return { tokenAmount: baseUnitAmount(word(raw, 0)), feeSun: sunAmount(word(raw, 1)) };
  }

  // trxAmount is net SUN paid to the seller; the fee is paid separately.
  async quoteSell(
    network: NetworkDescriptor,
    token: string,
    tokenAmount: BaseUnits,
    check: DispatchCheck,
  ): Promise<SellQuote> {
    const raw = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_QUOTE_SELL_EXACT_TOKEN,
      [
        { type: "address", value: token },
        { type: "uint256", value: tokenAmount },
      ],
      check,
    );
    return { trxAmountSun: sunAmount(word(raw, 0)), feeSun: sunAmount(word(raw, 1)) };
  }

  // Quote the token amount needed for one SUN of net proceeds.
  async minimumSellAmount(
    network: NetworkDescriptor,
    token: string,
    check: DispatchCheck,
  ): Promise<BaseUnits> {
    const inverse = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_QUOTE_SELL_EXACT_TRX,
      [
        { type: "address", value: token },
        { type: "uint256", value: "1" },
      ],
      check,
    );
    return baseUnitAmount(word(inverse, 0));
  }

  applyFloor(expected: string, slippageBips: number): string {
    return applySlippageMin(BigInt(expected), slippageBips).toString();
  }

  // Require the curve feature even when the SDK knows the network address.
  launchpadAddress(network: NetworkDescriptor): string {
    const name = SDK_NETWORKS[network.id];
    if (!isTronNetwork(network) || network.sunpump?.curve !== true || name === undefined) {
      throw new UsageError(
        "unsupported_network",
        `network ${network.id} has no SunPump curve enabled`,
      );
    }
    return String(getContractAddress(name, "launchpad"));
  }

  buyPayload(network: NetworkDescriptor, request: BuyRequest): ContractCallPayload {
    // TRX is sent as call value, so buys need no token approval.
    return fromAction(
      createLaunchpadBuyAction({
        launchpad: this.launchpadAddress(network),
        token: request.token,
        trxAmount: request.trxSun,
        minTokenOut: request.minTokenAmount,
      }),
    );
  }

  sellPayload(network: NetworkDescriptor, request: SellRequest): ContractCallPayload {
    return fromAction(
      createLaunchpadSellAction({
        launchpad: this.launchpadAddress(network),
        token: request.token,
        tokenAmount: request.tokenAmount,
        minTrxOut: request.minTrxSun,
      }),
    );
  }

  approvalPayload(
    network: NetworkDescriptor,
    token: string,
    spender: string,
    amount: string,
  ): ContractCallPayload {
    void network;
    return fromAction(createLaunchpadApproveAction(token, spender, amount));
  }

  static readonly UNLIMITED = MAX_UINT256.toString();

  async #read(
    network: NetworkDescriptor,
    contract: string,
    method: string,
    parameters: { type: string; value: unknown }[],
    check: DispatchCheck,
  ): Promise<string> {
    const gateway = this.gateways.get(network, "tron", check);
    const result = await gateway.triggerConstantContract(contract, method, parameters);
    const value = result[0];
    if (typeof value !== "string" || value === "") {
      throw new ChainError("provider_error", `${contract} did not answer ${method}`);
    }
    return value;
  }
}

const KNOWN_STATES = new Set<number>(Object.values(LAUNCHPAD_STATE));

// Reject missing SDK parameters: a missing minimum would remove slippage protection.
function fromAction(action: {
  target: string;
  functionSelector: string;
  parameters?: readonly { type: string; value?: unknown }[];
  callValue?: unknown;
}): ContractCallPayload {
  if (action.parameters === undefined) {
    throw new ChainError(
      "provider_error",
      `the launchpad SDK built ${action.functionSelector} with no parameters at all`,
    );
  }
  const parameters = action.parameters.map((parameter) => {
    if (parameter.value === undefined || parameter.value === null) {
      throw new ChainError(
        "provider_error",
        `the launchpad SDK built ${action.functionSelector} with an empty ${parameter.type} parameter`,
      );
    }
    return { type: parameter.type, value: String(parameter.value) };
  });
  return {
    target: action.target,
    method: action.functionSelector,
    parameters,
    ...(action.callValue === undefined ? {} : { callValueSun: sdkSun(action.callValue) }),
  };
}

// ABI hex word to a decimal string.
// The SDK may encode callValue as a bigint, a number, or decimal text.
function sdkSun(value: unknown): Sun {
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    throw new ChainError(
      "provider_error",
      `the launchpad SDK built a non-integer call value ${text}`,
    );
  }
  return sunAmount(text);
}

function word(data: string, index: number): string {
  return BigInt(`0x${data.slice(index * 64, (index + 1) * 64)}`).toString();
}

// ABI string: offset word, length word, then UTF-8 bytes.
function decodeString(data: string): string {
  const length = Number(BigInt(`0x${data.slice(64, 128)}`));
  const bytes = data.slice(128, 128 + length * 2);
  return Buffer.from(bytes, "hex").toString("utf8");
}
