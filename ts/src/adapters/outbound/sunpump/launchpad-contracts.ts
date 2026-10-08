/**
 * LaunchpadPort over the TRON gateway's contract calls.
 *
 * Shape and encoding only. Whether a trade is allowed, what floor it carries and how a receipt
 * reads are decisions, and they live in the use case above.
 *
 * Every signature and every parameter order here comes from `@sun-protocol/sun-sdk-launchpad` rather than
 * being retyped. Its `SELECTOR_*` constants are full method signatures, and its action factories
 * return exactly the `{target, method, parameters, callValue}` shape `TxPipeline` builds from — so
 * the vendor describes the call, our gateway encodes it, and a retyped signature cannot drift
 * into a silent wrong-method bug.
 */
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
import type { ContractCallPayload } from "../../../application/contracts/tron-contract-call.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import type { LaunchpadState } from "../../../domain/sunpump/curve.js";
import { LAUNCHPAD_STATE } from "../../../domain/sunpump/curve.js";

/** The SDK's own network names. Ours are canonical ids, so the two are mapped explicitly. */
const SDK_NETWORKS: Readonly<Record<string, Network>> = {
  "tron:728126428": "mainnet",
  "tron:3448148188": "nile",
};

export class SunPumpLaunchpadContracts implements LaunchpadPort {
  readonly approvalDomain = "sunpump-launchpad" as const;

  constructor(private readonly gateways: ChainGatewayProvider) {}

  /**
   * The curve's state, from the contract.
   *
   * Never from an HTTP `status` field: the API can be stale, and a stale "trading" sends a
   * transaction that must revert. A value the contract returns that we do not recognise is an
   * error rather than a guess — the enum grew from three to four once already, and treating an
   * unknown fifth as "tradeable" is how a launched token gets a doomed transaction.
   */
  async tokenState(network: NetworkDescriptor, token: string): Promise<LaunchpadState> {
    const raw = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_GET_TOKEN_STATE,
      [{ type: "address", value: token }],
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

  async tokenFacts(network: NetworkDescriptor, token: string): Promise<LaunchpadTokenFacts> {
    const [decimals, symbol] = await Promise.all([
      this.#read(network, token, "decimals()", []),
      this.#read(network, token, "symbol()", []),
    ]);
    return {
      address: token,
      decimals: Number(BigInt(`0x${decimals}`)),
      symbol: decodeString(symbol),
    };
  }

  async balanceOf(network: NetworkDescriptor, token: string, owner: string): Promise<string> {
    const raw = await this.#read(network, token, SELECTOR_TRC20_BALANCE_OF, [
      { type: "address", value: owner },
    ]);
    return word(raw, 0);
  }

  async allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
  ): Promise<string> {
    const raw = await this.#read(network, token, SELECTOR_TRC20_ALLOWANCE, [
      { type: "address", value: owner },
      { type: "address", value: spender },
    ]);
    return word(raw, 0);
  }

  /** `(tokenAmount, fee)` — the fee is already inside the TRX the caller named. */
  async quoteBuy(network: NetworkDescriptor, token: string, trxSun: string): Promise<BuyQuote> {
    const raw = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_QUOTE_BUY_EXACT_TRX,
      [
        { type: "address", value: token },
        { type: "uint256", value: trxSun },
      ],
    );
    return { tokenAmount: word(raw, 0), feeSun: word(raw, 1) };
  }

  /**
   * `(trxAmount, fee)` — `trxAmount` is what the seller receives, already net: the curve pays the
   * fee to its fee address beside it. A Nile sale quoted `(22728, 10000)` paid the seller 22728.
   */
  async quoteSell(
    network: NetworkDescriptor,
    token: string,
    tokenAmount: string,
  ): Promise<SellQuote> {
    const raw = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_QUOTE_SELL_EXACT_TOKEN,
      [
        { type: "address", value: token },
        { type: "uint256", value: tokenAmount },
      ],
    );
    return { trxAmountSun: word(raw, 0), feeSun: word(raw, 1) };
  }

  /**
   * The token amount whose net proceeds are one SUN — the smallest sale that pays the seller.
   *
   * Read from the contract's own inverse quote rather than derived here, so it follows the
   * curve and any change to the fee. Not the inverse of `minTxFee()`: that is where the seller's
   * net EQUALS the fee, roughly twice the true minimum.
   */
  async minimumSellAmount(network: NetworkDescriptor, token: string): Promise<string> {
    const inverse = await this.#read(
      network,
      this.launchpadAddress(network),
      SELECTOR_QUOTE_SELL_EXACT_TRX,
      [
        { type: "address", value: token },
        { type: "uint256", value: "1" },
      ],
    );
    return word(inverse, 0);
  }

  /** The SDK's own integer arithmetic: `expected * (10000 - bips) / 10000`, no float anywhere. */
  applyFloor(expected: string, slippageBips: number): string {
    return applySlippageMin(BigInt(expected), slippageBips).toString();
  }

  /**
   * The SDK's launchpad, and only where the network switches the curve on.
   *
   * The address comes from the SDK's chain config, so wallet-cli keeps no copy of it. The switch
   * is checked here as well as at the capability gate because `swap` asks this method whether a
   * curve exists at all: the SDK knows Nile's launchpad, and a router-only Nile must still answer
   * "no curve" rather than consult it.
   */
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
    // TRX travels as the call's VALUE, which is why a buy approves nothing.
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

  /**
   * The sale's approval uses an unlimited allowance.
   *
   * The curve pulls the tokens on every sale, and SunPump's contract is an upgradeable proxy that
   * expects a standing allowance — unlike V2/V3 liquidity deposits, where the amount is known and
   * exact. The use case says so in the dry run rather than letting it pass unremarked.
   */
  approvalPayload(
    network: NetworkDescriptor,
    token: string,
    spender: string,
    amount: string,
  ): ContractCallPayload {
    void network;
    return fromAction(createLaunchpadApproveAction(token, spender, amount));
  }

  /** What an unbounded approval is, taken from the SDK rather than written out. */
  static readonly UNLIMITED = MAX_UINT256.toString();

  async #read(
    network: NetworkDescriptor,
    contract: string,
    method: string,
    parameters: { type: string; value: unknown }[],
  ): Promise<string> {
    const gateway = this.gateways.get(network, "tron");
    const result = await gateway.triggerConstantContract(contract, method, parameters);
    const value = result[0];
    if (typeof value !== "string" || value === "") {
      throw new ChainError("provider_error", `${contract} did not answer ${method}`);
    }
    return value;
  }
}

const KNOWN_STATES = new Set<number>(Object.values(LAUNCHPAD_STATE));

/**
 * The SDK's action, as the payload our pipeline builds from.
 *
 * A guard rather than a cast: the SDK's parameter values are optional in its own types, and a
 * missing one would encode a zero minimum — a trade with no slippage protection at all, which
 * would succeed and look normal.
 */
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
    ...(action.callValue === undefined ? {} : { callValueSun: String(action.callValue) }),
  };
}

/** the 32-byte word at `index` of an ABI return, as a decimal string. */
function word(data: string, index: number): string {
  return BigInt(`0x${data.slice(index * 64, (index + 1) * 64)}`).toString();
}

/** a dynamic `string` return: offset, length, then the bytes. */
function decodeString(data: string): string {
  const length = Number(BigInt(`0x${data.slice(64, 128)}`));
  const bytes = data.slice(128, 128 + length * 2);
  return Buffer.from(bytes, "hex").toString("utf8");
}
