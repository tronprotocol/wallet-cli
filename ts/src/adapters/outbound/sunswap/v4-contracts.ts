/**
 * The V4 reads, over the pool manager and the CL position manager.
 *
 * Kept out of `liquidity-contracts.ts` because V4 answers the same questions in a different shape —
 * a pool id rather than a pair, a packed word rather than fields — and mixing the two would make the
 * V2/V3 file the place where a reader has to work out which protocol a helper belongs to.
 *
 * Two traps run through everything here, both measured rather than inferred:
 *
 * - **V4 does not wrap TRX.** A pool key's `currency0` may be the native marker, where V2 and V3
 *   would carry WTRX. The wrapped pair names a pool that also EXISTS, so getting this wrong deposits
 *   into a different market and returns a perfectly good receipt.
 * - **The zero address means two unrelated things.** `hooks` is the zero address when a pool has no
 *   hook, and on TRON that base58 string is the same one the market API uses for native TRX. So the
 *   data cannot distinguish "no hook" from "hooked to TRX", and nothing here pretends otherwise:
 *   `describeHooks` in the domain is what turns it into words.
 *
 * The position manager is the AUTHORITY on what a position is in. Its pool key is read rather than
 * reconstructed, and the packed word it returns is checked against that key before anything else
 * uses either — see `assertPositionPool`.
 */
import {
  buildV4CollectAction,
  buildV4DecreaseLiquidityAction,
  buildV4IncreaseLiquidityAction,
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
} from "@sun-sdk/sunswap-v4";
import { getContractAddress } from "@sun-sdk/chains";
// The builders' own return type: `#withPermits` passes one straight back into `encodeV4ContractCallAction`,
// so a structural stand-in would not satisfy it.
import type { ContractCallAction } from "@sun-sdk/core";
import type {
  ContractCallPayload,
  ContractParameter,
  V4DepositRequest,
  V4IncreaseRequest,
  V4OwedFees,
  V4OwedFeesQuery,
  V4PoolState,
  V4RemoveRequest,
  V4Position,
} from "../../../application/ports/sunswap/liquidity.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { TronGateway } from "../../../application/ports/chain/tron-gateway.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { tronBytesToBase58 } from "../../../domain/address/index.js";
import { normalisePoolId } from "../../../domain/sunswap/protocol.js";
import { assertPositionPool, decodeV4PositionInfo } from "../../../domain/sunswap/v4-position.js";

/** The SDK's own network names, which its V4 builders take. */
const SDK_NETWORKS: Readonly<Record<string, string>> = {
  "tron:728126428": "mainnet",
  "tron:3448148188": "nile",
};

export class SunSwapV4Contracts {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  /**
   * A pool, by id.
   *
   * `exists` is decided by the price, not by an error: an uninitialised pool answers zero rather
   * than reverting, and a caller who is told "it does not exist" looks for a different id while a
   * caller told "it has no price" knows to initialise it.
   */
  async poolState(network: NetworkDescriptor, poolId: string): Promise<V4PoolState> {
    const id = `0x${normalisePoolId(poolId)}`;
    const sdkNetwork = this.#network(network);
    const [slot0, liquidity, key] = await Promise.all([
      this.#read(network, buildV4PoolSlot0Read({ network: sdkNetwork, poolId: id } as never)),
      this.#read(network, buildV4PoolLiquidityRead({ network: sdkNetwork, poolId: id } as never)),
      this.#read(network, buildV4PoolKeyRead({ network: sdkNetwork, poolId: id } as never)),
    ]);

    const sqrtPriceX96 = word(slot0, 0);
    const poolKey = readPoolKey(key);
    return {
      poolId: normalisePoolId(poolId),
      // Zero price is the honest signal for "nothing has initialised this". The pool manager has no
      // per-pool existence flag; a pool is a key that has been written to.
      exists: sqrtPriceX96 !== "0",
      sqrtPriceX96,
      currentTick: signedWord(slot0, 1),
      liquidity: word(liquidity, 0),
      ...poolKey,
    };
  }

  /**
   * A position, as the position manager describes it.
   *
   * The pair, the tier, the spacing and the range all come from ITS reads. Nothing here rebuilds a
   * pool key from what the caller asked for: the caller may be wrong about which pool a position is
   * in, and the position is not.
   */
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

    // `(poolKey, uint256 info)`: five words of key, then the packed word.
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
    // The cross-check: the id packed into the position must be the id its own key hashes to.
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

  /**
   * What the position is owed, from the LP fee helper — or nothing at all.
   *
   * `getLPFees(address,bytes32,address,int24,int24,bytes32)` rebuilds the pool manager's position
   * key from the POSITION MANAGER as owner and the token id as salt, which is how V4 stores every
   * position minted through the manager, and returns `(uint256 feesOwed0, uint256 feesOwed1)`.
   * Two words, in the key's currency order, so `amount0` belongs to `currency0`.
   *
   * It returns `undefined` rather than zeros when the answer cannot be decoded with confidence —
   * a short return, or one that is not hex. Zero is a MEASUREMENT here and undefined is the
   * absence of one, and collapsing the two would tell a caller their position earned nothing on
   * the strength of a reply nobody could read. Transport failures are left to throw; the caller
   * decides whether a collection can proceed without the figure.
   */
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
    // Two uint256 words and nothing less. A shorter return is not a smaller number.
    if (data.length < 2 * 64 || !/^[0-9a-f]+$/i.test(data.slice(0, 2 * 64))) return undefined;
    return { amount0: word(words, 0), amount1: word(words, 1) };
  }

  /**
   * The deposit call, in the shape measured on Nile.
   *
   * No permits: a bare `modifyLiquidities`. With permits: `multicall(bytes[])` carrying one Permit2
   * forward call per token and then the deposit, so the grants and the spend are one transaction.
   * Order matters and is not incidental — a forward call after the deposit would authorize a pull that
   * has already been attempted.
   *
   * `sweepRecipient` is always set, and MEASURED to matter only where a native currency is involved.
   * On a token pair it changes nothing: the contract pulls exactly what it needs through Permit2, so
   * there is never an excess sitting in the position manager. On a native pair the CEILING is sent up
   * front as the call's value, so whatever the pool does not take must be returned — and then the
   * recipient is encoded. Set on both anyway, because one request shape serves both and a caller
   * should not have to know which pools make it load-bearing.
   */
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
      owner: request.owner as never,
      deadline: String(request.deadline),
      sweepRecipient: request.sweepRecipient as never,
    });

    return this.#payload(this.#withPermits(sdkNetwork, mint, request.owner, request.permits));
  }

  /**
   * The increase call: more liquidity into a position that already exists.
   *
   * Same shape as the deposit above and same ceiling — an increase IS a deposit, so `amount0Max` /
   * `amount1Max` bound it from ABOVE and a native pair sends the ceiling as the call's value with the
   * remainder swept back. What the position already fixes is not passed: its range is its own, and
   * there is no owner because nothing is being minted.
   */
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
    return this.#payload(this.#withPermits(sdkNetwork, increase, request.owner, request.permits));
  }

  /**
   * A liquidity action, wrapped behind the grants it needs — or left alone when it needs none.
   *
   * The permits come FIRST and that is not incidental: a forward call after the liquidity action
   * would authorize a pull that has already been attempted.
   *
   * THE CALL VALUE IS CARRIED ACROSS. `buildV4MulticallAction` computes none of its own — only the
   * inner action knows a native pair sends its ceiling as the value — so a multicall built without
   * this would forward the grants and then send a native deposit worth nothing. Shared by the mint
   * and the increase because the trap is the same on both.
   */
  #withPermits(
    sdkNetwork: never,
    action: ContractCallAction,
    owner: string,
    permits: readonly { readonly grant: unknown; readonly signature: string }[],
  ): ContractCallAction {
    if (permits.length === 0) return action;
    return buildV4MulticallAction({
      network: sdkNetwork,
      calls: [
        ...permits.map((permit) =>
          encodeV4Permit2ForwardCall({
            owner: owner as never,
            permit: { ...(permit.grant as object), signature: permit.signature } as never,
          }),
        ),
        encodeV4ContractCallAction(action),
      ],
      ...(action.callValue === undefined ? {} : { callValue: action.callValue }),
    });
  }

  /**
   * The withdrawal call.
   *
   * One call rather than V3's multicall of two: V4's `decreaseLiquidity` settles the pair itself, so
   * there is no separate collect to pack beside it. That is a real difference between the protocols and
   * not an omission — V3 needed the multicall because `decreaseLiquidity` there only credits the
   * position and transfers nothing.
   */
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

  /** The fee collection. Everything owed, because the contract offers no "how much". */
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

  /** A pool key as the SDK wants it, from the key we were given rather than rebuilt. */
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

  /** An encoder action as this codebase's own payload. */
  #payload(call: ContractCallAction): ContractCallPayload {
    return {
      target: call.target,
      method: call.functionSelector,
      parameters: (call.parameters ?? []).map(plainParameter),
      ...(call.callValue === undefined || call.callValue === 0n
        ? {}
        : { callValueSun: call.callValue.toString() }),
    };
  }

  /** The Permit2 contract, from the SDK's own chain config — the source its encoders use. */
  permit2(network: NetworkDescriptor): string {
    return this.#contract(network, "permit2", "Permit2 contract");
  }

  positionManager(network: NetworkDescriptor): string {
    return this.#contract(network, "sunswapV4PositionManager", "SunSwap V4 position manager");
  }

  /**
   * One of the SDK's own configured contracts.
   *
   * From the SDK's chain config rather than ours, because that is the source its encoders use — the
   * same reason `#network` cross-checks our recorded position manager against it rather than trusting
   * either alone.
   */
  #contract(network: NetworkDescriptor, key: string, label: string): string {
    const address = String(getContractAddress(this.#network(network), key as never));
    if (address.length === 0) {
      throw new UsageError("unsupported_network", `network ${network.id} has no ${label}`);
    }
    return address;
  }

  /** A tick spacing as a pool key's `parameters` word. Only for a pool being created. */
  parametersFor(tickSpacing: number): string {
    return encodeParameters(tickSpacing);
  }

  /** The pool id a key hashes to. The same derivation the pool manager uses. */
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
      // A constant call is executed as if sent by somebody. Nothing here depends on who, so the
      // zero address is used rather than a caller's, which would imply it did.
      ZERO_ADDRESS,
    );
  }

  /**
   * The SDK's name for this network, and a check that we and it agree about V4.
   *
   * The contract addresses the read builders use come from the SDK's own chain config, not from ours.
   * So our `v4PositionManager` entry is not what makes V4 work — which would make it decoration. It
   * is a RECORD that has to agree: when it is present and differs from the address the builders will
   * actually call, that is a configuration fault, and finding it here is far cheaper than finding it
   * in a receipt that names a contract nobody expected.
   */
  #network(network: NetworkDescriptor): never {
    const name = SDK_NETWORKS[network.id];
    if (name === undefined || !isTronNetwork(network)) {
      throw new UsageError(
        "unsupported_network",
        `network ${network.id} has no SunSwap V4 deployment`,
      );
    }
    const recorded = network.sunswap?.contracts?.v4PositionManager;
    if (recorded !== undefined) {
      const actual = String(getContractAddress(name as never, "sunswapV4PositionManager"));
      if (recorded !== actual) {
        throw new UsageError(
          "invalid_config",
          `network ${network.id} records the SunSwap V4 position manager as ${recorded} and the SDK will call ${actual}; one of the two is wrong and a deposit must not be sent on a guess`,
        );
      }
    }
    return name as never;
  }
}

/** The pool key's five words, wherever they sit at the front of a return. */
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
      "provider_error",
      `a V4 pool key came back as ${data.length / 2} bytes, which cannot hold one`,
    );
  }
  const parameters = `0x${data.slice(4 * 64, 5 * 64)}`;
  const decoded = decodeV4PoolParameters(parameters as never) as { tickSpacing?: number };
  const tickSpacing = decoded.tickSpacing;
  if (typeof tickSpacing !== "number" || tickSpacing <= 0) {
    throw new ChainError(
      "provider_error",
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

/** The tick spacing back into a `parameters` word, which is where V4 keeps it. */
function encodeParameters(tickSpacing: number): string {
  // The layout the live pools use: tick spacing in bits 16–39, hook registrations below it. Taken
  // from a real pool's own value — 0x…0a0000 is spacing 10, 0x…3c0000 is spacing 60.
  return `0x${(BigInt(tickSpacing) << 16n).toString(16).padStart(64, "0")}`;
}

const hex = (words: readonly string[]): string => words.join("").replace(/^0x/, "");

const word = (words: readonly string[], index: number): string =>
  BigInt(`0x${hex(words).slice(index * 64, (index + 1) * 64) || "0"}`).toString();

/** An int24 or int256 word. Ticks are signed and a pool below its reference price has a negative one. */
function signedWord(words: readonly string[], index: number): number {
  const raw = BigInt(`0x${hex(words).slice(index * 64, (index + 1) * 64) || "0"}`);
  return Number(raw >= 1n << 255n ? raw - (1n << 256n) : raw);
}

/** An address-typed word: the low 20 bytes, as base58. */
function addressFromWord(data: string): string {
  return tronBytesToBase58(Uint8Array.from(Buffer.from(`41${data.slice(24, 64)}`, "hex")));
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

/** The zero address, used here only as "nobody in particular is asking". */
const ZERO_ADDRESS = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

/**
 * One encoder parameter in this codebase's own terms.
 *
 * The encoder emits `bigint` for a `uint256` and a string array for `bytes[]`; both become strings,
 * because the gateway re-encodes from `{type, value}` and a bigint would not survive the trip.
 */
function plainParameter(parameter: { type: string; value: unknown }): ContractParameter {
  const { type, value } = parameter;
  if (Array.isArray(value)) return { type, value: value.map((item) => String(item)) };
  return { type, value: typeof value === "bigint" ? value.toString() : String(value) };
}
