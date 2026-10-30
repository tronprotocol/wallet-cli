// V4 currency0 can be native TRX; replacing it with WTRX selects a different pool.
import {
  buildV4CollectAction,
  buildV4DecreaseLiquidityAction,
  buildV4IncreaseLiquidityAction,
  buildV4InitializePoolAction,
  buildV4MintPositionAction,
  buildV4MulticallAction,
  encodeV4ContractCallAction,
  encodeV4Permit2ForwardCall,
  buildV4PoolKeyRead,
  buildV4PoolLiquidityRead,
  buildV4PoolSlot0Read,
  buildV4PoolAndPositionInfoRead,
  buildV4PositionFeesRead,
  buildV4PositionLiquidityRead,
  buildV4PositionOwnerRead,
  computeV4PoolId,
  decodeV4PoolParameters,
  normalizeV4PoolKey,
} from "@sun-protocol/sun-sdk-sunswap-v4";
import { getContractAddress } from "@sun-protocol/sun-sdk-chains";
import type { ContractCallAction } from "@sun-protocol/sun-sdk-core";
import type {
  ContractCallPayload,
  ContractParameter,
  V4DepositRequest,
  V4LiquidityReceiptQuery,
  V4LiquidityResult,
  V4IncreaseRequest,
  V4OwedFees,
  V4OwedFeesQuery,
  V4PoolState,
  V4RemoveRequest,
  V4Position,
} from "../../../application/ports/sunswap/liquidity.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { TronGateway } from "../../../application/ports/chain/tron/tron-gateway.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { tronAddressFromHash20 } from "../../../domain/address/index.js";
import { FAMILIES } from "../../../domain/family/index.js";
import { normalisePoolId } from "../../../domain/sunswap/protocol.js";
import { assertPositionPool, decodeV4PositionInfo } from "../../../domain/sunswap/v4-position.js";
import { decodeV4LiquidityReceipt } from "./v4-liquidity-receipt.js";
import { V4_NO_HOOKS } from "../../../domain/sunswap/v4-pool.js";
import { sunAmount, baseUnitAmount } from "../../../domain/amounts/index.js";

const SDK_NETWORKS: Readonly<Record<string, string>> = {
  "tron:728126428": "mainnet",
  "tron:3448148188": "nile",
};

export class SunSwapV4Contracts {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  async liquidityResult(
    network: NetworkDescriptor,
    txId: string,
    query: V4LiquidityReceiptQuery,
  ): Promise<V4LiquidityResult | undefined> {
    const sdkNetwork = this.#network(network);
    const info = await this.gateways.get(network, "tron").getTransactionInfoById(txId);
    return decodeV4LiquidityReceipt(
      info,
      query,
      String(getContractAddress(sdkNetwork, "sunswapV4PositionManager")),
      String(getContractAddress(sdkNetwork, "sunswapV4PoolManager")),
    );
  }

  // Uninitialised pools return a zero price rather than reverting.
  async poolState(network: NetworkDescriptor, poolId: string): Promise<V4PoolState> {
    const id = `0x${normalisePoolId(poolId)}`;
    const sdkNetwork = this.#network(network);
    const [slot0, liquidity, key] = await Promise.all([
      this.#read(network, buildV4PoolSlot0Read({ network: sdkNetwork, poolId: id } as never)),
      this.#read(network, buildV4PoolLiquidityRead({ network: sdkNetwork, poolId: id } as never)),
      this.#read(network, buildV4PoolKeyRead({ network: sdkNetwork, poolId: id } as never)),
    ]);

    const sqrtPriceX96 = word(slot0, 0);
    // An unknown pool id returns an all-zero key with no valid tick spacing.
    const poolKey = isAbsentPoolKey(key) ? ABSENT_POOL_KEY : readPoolKey(key);
    return {
      poolId: normalisePoolId(poolId),
      exists: sqrtPriceX96 !== "0",
      sqrtPriceX96,
      currentTick: signedWord(slot0, 1),
      liquidity: word(liquidity, 0),
      ...poolKey,
    };
  }

  // Read the position manager's pool key; caller-supplied pool details may be wrong.
  async position(network: NetworkDescriptor, tokenId: string): Promise<V4Position> {
    const sdkNetwork = this.#network(network);
    const id = assertTokenId(tokenId);
    const [info, liquidity, owner] = await Promise.all([
      this.#read(
        network,
        buildV4PoolAndPositionInfoRead({ network: sdkNetwork, tokenId: id } as never),
      ),
      this.#read(
        network,
        buildV4PositionLiquidityRead({ network: sdkNetwork, tokenId: id } as never),
      ),
      this.#read(network, buildV4PositionOwnerRead({ network: sdkNetwork, tokenId: id } as never)),
    ]);

    // getPoolAndPositionInfo returns five key words followed by packed position info.
    assertWords(info, 6, "getPoolAndPositionInfo");
    assertWords(liquidity, 1, "getPositionLiquidity");
    assertWords(owner, 1, "ownerOf");
    const poolKey = readPoolKey(info);
    const packed = decodeV4PositionInfo(`0x${hex(info).slice(5 * 64, 6 * 64)}`);
    const poolId = computeV4PoolId(
      normalizeV4PoolKey({
        network: sdkNetwork,
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        hooks: poolKey.hooks,
        fee: poolKey.fee,
        parameters: poolKey.parameters,
      } as never),
    );
    assertPositionPool(packed, String(poolId));

    return {
      tokenId: id,
      owner: addressFromWord(hex(owner).slice(0, 64)),
      poolId: normalisePoolId(String(poolId)),
      currency0: poolKey.currency0,
      currency1: poolKey.currency1,
      fee: poolKey.fee,
      tickSpacing: poolKey.tickSpacing,
      hooks: poolKey.hooks,
      tickLower: packed.tickLower,
      tickUpper: packed.tickUpper,
      liquidity: word(liquidity, 0),
      hasSubscriber: packed.hasSubscriber,
    };
  }

  // Fees follow currency order; undecodable replies return undefined, while transport failures throw.
  async owedFees(
    network: NetworkDescriptor,
    position: V4OwedFeesQuery,
  ): Promise<V4OwedFees | undefined> {
    const words = await this.#read(
      network,
      buildV4PositionFeesRead({
        network: this.#network(network),
        tokenId: assertTokenId(position.tokenId),
        poolId: `0x${normalisePoolId(position.poolId)}`,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
      } as never),
    );
    const data = hex(words);
    if (data.length < 2 * 64 || !/^[0-9a-f]+$/i.test(data.slice(0, 2 * 64))) return undefined;
    return { amount0: baseUnitAmount(word(words, 0)), amount1: baseUnitAmount(word(words, 1)) };
  }

  // Set sweepRecipient to return unused native TRX from the sent ceiling.
  depositPayload(network: NetworkDescriptor, request: V4DepositRequest): ContractCallPayload {
    const sdkNetwork = this.#network(network);
    const mint = buildV4MintPositionAction({
      network: sdkNetwork,
      positionConfig: {
        poolKey: normalizeV4PoolKey({
          network: sdkNetwork,
          currency0: request.pool.currency0,
          currency1: request.pool.currency1,
          hooks: request.pool.hooks,
          fee: request.pool.fee,
          parameters: request.pool.parameters,
        } as never),
        tickLower: request.tickLower,
        tickUpper: request.tickUpper,
      } as never,
      liquidity: request.liquidity,
      amount0Max: request.amount0Max,
      amount1Max: request.amount1Max,
      owner: request.recipient as never,
      deadline: String(request.deadline),
      sweepRecipient: request.sweepRecipient as never,
    });

    const initialize =
      request.initialSqrtPriceX96 === undefined
        ? undefined
        : buildV4InitializePoolAction({
            network: sdkNetwork,
            poolKey: this.#poolKey(sdkNetwork, request.pool),
            sqrtPriceX96: request.initialSqrtPriceX96,
          });
    return this.#payload(
      this.#liquidityCall(sdkNetwork, mint, request.permitOwner, request.permits, initialize),
    );
  }

  increasePayload(network: NetworkDescriptor, request: V4IncreaseRequest): ContractCallPayload {
    const sdkNetwork = this.#network(network);
    const increase = buildV4IncreaseLiquidityAction({
      network: sdkNetwork,
      poolKey: this.#poolKey(sdkNetwork, request.pool),
      tokenId: request.tokenId,
      liquidity: request.liquidity,
      amount0Max: request.amount0Max,
      amount1Max: request.amount1Max,
      deadline: String(request.deadline),
      sweepRecipient: request.sweepRecipient as never,
    });
    return this.#payload(this.#liquidityCall(sdkNetwork, increase, request.owner, request.permits));
  }

  // Initialize and deposit atomically; forward permits before spending.
  // Carry the native call value: the multicall builder does not derive it.
  #liquidityCall(
    sdkNetwork: never,
    action: ContractCallAction,
    permitOwner: string,
    permits: readonly { readonly grant: unknown; readonly signature: string }[],
    initialize?: ContractCallAction,
  ): ContractCallAction {
    if (permits.length === 0 && initialize === undefined) return action;
    return buildV4MulticallAction({
      network: sdkNetwork,
      calls: [
        ...(initialize === undefined ? [] : [encodeV4ContractCallAction(initialize)]),
        ...permits.map((permit) =>
          encodeV4Permit2ForwardCall({
            owner: permitOwner as never,
            permit: { ...(permit.grant as object), signature: permit.signature } as never,
          }),
        ),
        encodeV4ContractCallAction(action),
      ],
      ...(action.callValue === undefined ? {} : { callValue: action.callValue }),
    });
  }

  // V4 decrease settles principal and fees without a separate collect call.
  removePayload(network: NetworkDescriptor, request: V4RemoveRequest): ContractCallPayload {
    const sdkNetwork = this.#network(network);
    const call = buildV4DecreaseLiquidityAction({
      network: sdkNetwork,
      poolKey: this.#poolKey(sdkNetwork, request.pool),
      tokenId: request.tokenId,
      liquidity: request.liquidity,
      amount0Min: request.amount0Min,
      amount1Min: request.amount1Min,
      recipient: request.recipient as never,
      deadline: String(request.deadline),
    });
    return this.#payload(call);
  }

  // V4 collection takes all owed fees; there is no amount parameter.
  collectPayload(
    network: NetworkDescriptor,
    request: {
      pool: V4RemoveRequest["pool"];
      tokenId: string;
      recipient: string;
      deadline: number;
    },
  ): ContractCallPayload {
    const sdkNetwork = this.#network(network);
    const call = buildV4CollectAction({
      network: sdkNetwork,
      poolKey: this.#poolKey(sdkNetwork, request.pool),
      tokenId: request.tokenId,
      recipient: request.recipient as never,
      deadline: String(request.deadline),
    });
    return this.#payload(call);
  }

  #poolKey(sdkNetwork: never, pool: V4RemoveRequest["pool"]) {
    return normalizeV4PoolKey({
      network: sdkNetwork,
      currency0: pool.currency0,
      currency1: pool.currency1,
      hooks: pool.hooks,
      fee: pool.fee,
      parameters: pool.parameters,
    } as never);
  }

  #payload(call: ContractCallAction): ContractCallPayload {
    return {
      target: call.target,
      method: call.functionSelector,
      parameters: (call.parameters ?? []).map(plainParameter),
      ...(call.callValue === undefined || call.callValue === 0n
        ? {}
        : { callValueSun: sunAmount(call.callValue) }),
    };
  }

  permit2(network: NetworkDescriptor): string {
    return this.#contract(network, "permit2", "Permit2 contract");
  }

  positionManager(network: NetworkDescriptor): string {
    return this.#contract(network, "sunswapV4PositionManager", "SunSwap V4 position manager");
  }

  // Use the same contract config as the SDK encoders.
  #contract(network: NetworkDescriptor, key: string, label: string): string {
    const address = String(getContractAddress(this.#network(network), key as never));
    if (address.length === 0) {
      throw new UsageError("unsupported_network", `network ${network.id} has no ${label}`);
    }
    return address;
  }

  parametersFor(tickSpacing: number): string {
    return encodeParameters(tickSpacing);
  }

  poolIdOf(
    network: NetworkDescriptor,
    key: {
      token0: string;
      token1: string;
      hooks: string;
      fee: number;
      tickSpacing: number;
    },
  ): string {
    const parameters = encodeParameters(key.tickSpacing);
    const poolId = computeV4PoolId(
      normalizeV4PoolKey({
        network: this.#network(network),
        currency0: key.token0,
        currency1: key.token1,
        hooks: key.hooks,
        fee: key.fee,
        parameters,
      } as never),
    );
    return normalisePoolId(String(poolId));
  }

  async #read(
    network: NetworkDescriptor,
    spec: { target: string; functionSelector: string; parameters?: readonly unknown[] },
  ): Promise<readonly string[]> {
    const gateway: TronGateway = this.gateways.get(network, "tron");
    return gateway.triggerConstantContract(
      spec.target,
      spec.functionSelector,
      [...((spec.parameters ?? []) as { type: string; value: string }[])],
      ZERO_ADDRESS,
    );
  }

  #network(network: NetworkDescriptor): never {
    const name = SDK_NETWORKS[network.id];
    if (name === undefined || !isTronNetwork(network)) {
      throw new UsageError(
        "unsupported_network",
        `network ${network.id} has no SunSwap V4 deployment`,
      );
    }
    return name as never;
  }
}

function isAbsentPoolKey(words: readonly string[]): boolean {
  const data = hex(words);
  return data.length >= 5 * 64 && /^0+$/.test(data.slice(0, 5 * 64));
}

const ABSENT_POOL_KEY = {
  currency0: V4_NO_HOOKS,
  currency1: V4_NO_HOOKS,
  hooks: V4_NO_HOOKS,
  fee: 0,
  parameters: `0x${"0".repeat(64)}`,
  tickSpacing: 0,
} as const;

function readPoolKey(words: readonly string[]): {
  currency0: string;
  currency1: string;
  hooks: string;
  fee: number;
  parameters: string;
  tickSpacing: number;
} {
  const data = hex(words);
  if (data.length < 5 * 64) {
    throw new ChainError(
      "invalid_node_response",
      `a V4 pool key came back as ${data.length / 2} bytes, which cannot hold one`,
    );
  }
  const parameters = `0x${data.slice(4 * 64, 5 * 64)}`;
  const decoded = decodeV4PoolParameters(parameters as never) as { tickSpacing?: number };
  const tickSpacing = decoded.tickSpacing;
  if (typeof tickSpacing !== "number" || tickSpacing <= 0) {
    throw new ChainError(
      "invalid_node_response",
      `a V4 pool's parameters decoded to a tick spacing of ${String(tickSpacing)}, which no range can be aligned to`,
    );
  }
  return {
    currency0: addressFromWord(data.slice(0, 64)),
    currency1: addressFromWord(data.slice(64, 128)),
    hooks: addressFromWord(data.slice(128, 192)),
    fee: Number(BigInt(`0x${data.slice(192, 256)}`)),
    parameters,
    tickSpacing,
  };
}

function encodeParameters(tickSpacing: number): string {
  // Tick spacing occupies bits 16–39; lower bits hold hook registrations.
  return `0x${(BigInt(tickSpacing) << 16n).toString(16).padStart(64, "0")}`;
}

const hex = (words: readonly string[]): string => words.join("").replace(/^0x/, "");

function assertWords(words: readonly string[], count: number, method: string): void {
  const data = hex(words);
  if (!/^[0-9a-fA-F]*$/.test(data) || data.length < count * 64) {
    throw new ChainError(
      "invalid_node_response",
      `the V4 position manager answered ${method} with data that cannot be decoded: expected at least ${count * 32} bytes of ABI words`,
    );
  }
}

const word = (words: readonly string[], index: number): string =>
  BigInt(`0x${hex(words).slice(index * 64, (index + 1) * 64) || "0"}`).toString();

// ABI signed integers are sign-extended to 256 bits.
function signedWord(words: readonly string[], index: number): number {
  const raw = BigInt(`0x${hex(words).slice(index * 64, (index + 1) * 64) || "0"}`);
  return Number(raw >= 1n << 255n ? raw - (1n << 256n) : raw);
}

// Decode the low 20 bytes as TRON base58.
function addressFromWord(data: string): string {
  return tronAddressFromHash20(data.slice(24, 64));
}

function assertTokenId(tokenId: string): string {
  const text = tokenId.trim();
  if (!/^\d+$/.test(text)) {
    throw new UsageError(
      "invalid_value",
      `--position-id must be a whole number; ${tokenId} is not one`,
    );
  }
  return text;
}

const ZERO_ADDRESS = FAMILIES.tron.zeroAddress;

// Use strings across the gateway boundary; bigint cannot cross JSON.
function plainParameter(parameter: { type: string; value: unknown }): ContractParameter {
  const { type, value } = parameter;
  if (Array.isArray(value)) return { type, value: value.map((item) => String(item)) };
  return { type, value: typeof value === "bigint" ? value.toString() : String(value) };
}
