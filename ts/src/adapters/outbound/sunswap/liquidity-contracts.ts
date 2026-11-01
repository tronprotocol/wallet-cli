// Read token decimals on chain; keep monetary values as decimal strings or BigInt.
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import {
  checkedTokenDecimals,
  baseUnitAmount,
  type BaseUnits,
  type Sun,
  sunAmount,
} from "../../../domain/amounts/index.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  maxLiquidityForAmounts,
  NonfungiblePositionManager,
  SqrtPriceMath,
  TickMath,
} from "@sun-protocol/sun-sdk-sunswap-v3";
import { getContractAddress } from "@sun-protocol/sun-sdk-chains";
import type { ChainContracts } from "@sun-protocol/sun-sdk-chains";
import type { Network } from "@sun-protocol/sun-sdk-core";
import type {
  ContractCallPayload,
  LiquidityPort,
  LiquidityContractAddresses,
  TokenFacts,
  V2AddLiquidityEthRequest,
  V2AddLiquidityRequest,
  V2RemoveLiquidityEthRequest,
  V2RemoveLiquidityRequest,
  V2PairState,
  V3AmountPlan,
  V3IncreaseRequest,
  V3MintRequest,
  V3PoolState,
  V3Position,
  V3RemoveRequest,
  V4DepositRequest,
  V4LiquidityReceiptQuery,
  V4LiquidityResult,
  V4IncreaseRequest,
  V4RemoveRequest,
  V4OwedFees,
  V4OwedFeesQuery,
  V4PoolState,
  V4Position,
} from "../../../application/ports/sunswap/liquidity.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import { SunSwapV4Contracts } from "./v4-contracts.js";
import { sdkNetworkName } from "./sdk-runtime.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import {
  tronAddressFromHash20,
  tronAddressToEvmHex,
  tronHash20Hex,
} from "../../../domain/address/index.js";
import { FAMILIES, sameAddress } from "../../../domain/family/index.js";

// A missing pair returns the zero address rather than reverting.
const ZERO_ADDRESS_HEX = tronHash20Hex(FAMILIES.tron.zeroAddress);

interface TronLogEntry {
  readonly address?: string;
  readonly topics?: readonly string[];
  readonly data?: string;
}

// Collect all principal and fees owed to the position.
const MAX_UINT128 = ((1n << 128n) - 1n).toString();

const COLLECT_TOPIC = eventTopic("Collect(uint256,address,uint256,uint256)");

// TRON log topics are hex without a 0x prefix.
function eventTopic(signature: string): string {
  return bytesToHex(keccak_256(utf8ToBytes(signature)));
}

const ERC721_TRANSFER_TOPIC = eventTopic("Transfer(address,address,uint256)");

export class SunSwapLiquidityContracts implements LiquidityPort {
  readonly approvalDomain = "sunswap-contracts" as const;

  readonly #v4: SunSwapV4Contracts;

  constructor(private readonly gateways: ChainGatewayProvider) {
    this.#v4 = new SunSwapV4Contracts(gateways);
  }

  v4LiquidityResult(
    network: NetworkDescriptor,
    txId: string,
    query: V4LiquidityReceiptQuery,
    check: DispatchCheck,
  ): Promise<V4LiquidityResult | undefined> {
    return this.#v4.liquidityResult(network, txId, query, check);
  }

  async v4PoolState(
    network: NetworkDescriptor,
    poolId: string,
    check: DispatchCheck,
  ): Promise<V4PoolState> {
    return this.#v4.poolState(network, poolId, check);
  }

  async v4Position(
    network: NetworkDescriptor,
    tokenId: string,
    check: DispatchCheck,
  ): Promise<V4Position> {
    return this.#v4.position(network, tokenId, check);
  }

  async v4OwedFees(
    network: NetworkDescriptor,
    position: V4OwedFeesQuery,
    check: DispatchCheck,
  ): Promise<V4OwedFees | undefined> {
    return this.#v4.owedFees(network, position, check);
  }

  v4DepositPayload(network: NetworkDescriptor, request: V4DepositRequest): ContractCallPayload {
    return this.#v4.depositPayload(network, request);
  }

  v4IncreasePayload(network: NetworkDescriptor, request: V4IncreaseRequest): ContractCallPayload {
    return this.#v4.increasePayload(network, request);
  }

  v4RemovePayload(network: NetworkDescriptor, request: V4RemoveRequest): ContractCallPayload {
    return this.#v4.removePayload(network, request);
  }

  v4CollectPayload(
    network: NetworkDescriptor,
    request: {
      readonly pool: V4RemoveRequest["pool"];
      readonly tokenId: string;
      readonly recipient: string;
      readonly deadline: number;
    },
  ): ContractCallPayload {
    return this.#v4.collectPayload(network, request);
  }

  permit2Address(network: NetworkDescriptor): string {
    return this.#v4.permit2(network);
  }

  v4PositionManager(network: NetworkDescriptor): string {
    return this.#v4.positionManager(network);
  }

  v4PoolIdOf(
    network: NetworkDescriptor,
    key: {
      readonly token0: string;
      readonly token1: string;
      readonly hooks: string;
      readonly fee: number;
      readonly tickSpacing: number;
    },
  ): string {
    return this.#v4.poolIdOf(network, key);
  }

  v4ParametersFor(tickSpacing: number): string {
    return this.#v4.parametersFor(tickSpacing);
  }

  tickAtSqrtPrice(sqrtPriceX96: string): number {
    if (
      !/^\d+$/.test(sqrtPriceX96) ||
      BigInt(sqrtPriceX96) < BigInt(TickMath.MIN_SQRT_RATIO.toString()) ||
      BigInt(sqrtPriceX96) >= BigInt(TickMath.MAX_SQRT_RATIO.toString())
    ) {
      throw new UsageError(
        "invalid_value",
        `--sqrt-price must be an integer from ${TickMath.MIN_SQRT_RATIO.toString()} (inclusive) to ${TickMath.MAX_SQRT_RATIO.toString()} (exclusive)`,
      );
    }
    return TickMath.getTickAtSqrtRatio(jsbiOf(sqrtPriceX96));
  }

  async tokenFacts(
    network: NetworkDescriptor,
    address: string,
    check: DispatchCheck,
  ): Promise<TokenFacts> {
    const [decimals, symbol] = await Promise.all([
      this.#read(check, network, address, "decimals()", []),
      this.#read(check, network, address, "symbol()", []),
    ]);
    return {
      address,
      decimals: checkedTokenDecimals(Number(BigInt(`0x${decimals}`))),
      symbol: decodeString(symbol),
    };
  }

  // TRC-20 name is optional; a failed display-only read returns undefined.
  async tokenName(
    network: NetworkDescriptor,
    address: string,
    check: DispatchCheck,
  ): Promise<string | undefined> {
    try {
      return decodeString(await this.#read(check, network, address, "name()", [])) || undefined;
    } catch {
      return undefined;
    }
  }

  async positionNftFacts(
    network: NetworkDescriptor,
    protocol: "V3" | "V4",
    check: DispatchCheck,
  ): Promise<{ name: string; symbol: string }> {
    const manager =
      protocol === "V4" ? this.v4PositionManager(network) : this.#positionManager(network);
    const [name, symbol] = await Promise.all([
      this.#read(check, network, manager, "name()", []),
      this.#read(check, network, manager, "symbol()", []),
    ]);
    return { name: decodeString(name), symbol: decodeString(symbol) };
  }

  async v2PairState(
    network: NetworkDescriptor,
    token0: string,
    token1: string,
    check: DispatchCheck,
  ): Promise<V2PairState> {
    const factory = await this.#read(check, network, this.#router(network), "factory()", []);
    const pairHex = await this.#read(
      check,
      network,
      addressFromWord(factory),
      "getPair(address,address)",
      [
        { type: "address", value: token0 },
        { type: "address", value: token1 },
      ],
    );
    if (pairHex.slice(24) === ZERO_ADDRESS_HEX) {
      return {
        pairAddress: "",
        reserve0: "0",
        reserve1: "0",
        totalSupply: "0",
        lpDecimals: 0,
        exists: false,
      };
    }
    const pairAddress = addressFromWord(pairHex);
    const [reserves, supply, pairToken0, lpDecimals] = await Promise.all([
      this.#read(check, network, pairAddress, "getReserves()", []),
      this.#read(check, network, pairAddress, "totalSupply()", []),
      this.#read(check, network, pairAddress, "token0()", []),
      // Read LP decimals on chain instead of assuming 18.
      this.#read(check, network, pairAddress, "decimals()", []),
    ]);
    // Return reserves in the caller's token order, not the pair's sorted order.
    const [reserveA, reserveB] = [word(reserves, 0), word(reserves, 1)];
    const sameOrder = sameAddress("tron", addressFromWord(pairToken0), token0);
    return {
      pairAddress,
      reserve0: sameOrder ? reserveA : reserveB,
      reserve1: sameOrder ? reserveB : reserveA,
      totalSupply: BigInt(`0x${supply}`).toString(),
      lpDecimals: checkedTokenDecimals(Number(BigInt(`0x${lpDecimals}`))),
      exists: true,
    };
  }

  async balanceOf(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    check: DispatchCheck,
  ): Promise<BaseUnits> {
    const raw = await this.#read(check, network, token, "balanceOf(address)", [
      { type: "address", value: owner },
    ]);
    return baseUnitAmount(BigInt(`0x${raw}`));
  }

  async nativeBalance(
    network: NetworkDescriptor,
    owner: string,
    check: DispatchCheck,
  ): Promise<Sun> {
    const account = await this.gateways.get(network, "tron", check).getAccount(owner);
    return sunAmount(String(account.balance ?? "0"));
  }

  async allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
    check: DispatchCheck,
  ): Promise<BaseUnits> {
    const raw = await this.#read(check, network, token, "allowance(address,address)", [
      { type: "address", value: owner },
      { type: "address", value: spender },
    ]);
    return baseUnitAmount(BigInt(`0x${raw}`));
  }

  // Approve only the supplied amount.
  approvalPayload(
    _network: NetworkDescriptor,
    token: string,
    spender: string,
    amount: string,
  ): ContractCallPayload {
    return {
      target: token,
      method: "approve(address,uint256)",
      parameters: [
        { type: "address", value: spender },
        { type: "uint256", value: amount },
      ],
    };
  }

  v2AddLiquidityPayload(
    network: NetworkDescriptor,
    request: V2AddLiquidityRequest,
  ): ContractCallPayload {
    return {
      target: this.#router(network),
      method: "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
      parameters: [
        { type: "address", value: request.token0.address },
        { type: "address", value: request.token1.address },
        { type: "uint256", value: request.amount0Desired },
        { type: "uint256", value: request.amount1Desired },
        { type: "uint256", value: request.amount0Min },
        { type: "uint256", value: request.amount1Min },
        { type: "address", value: request.recipient },
        { type: "uint256", value: String(request.deadline) },
      ],
    };
  }

  // The native TRX amount is the call value in SUN, not an ABI argument.
  v2AddLiquidityEthPayload(
    network: NetworkDescriptor,
    request: V2AddLiquidityEthRequest,
  ): ContractCallPayload {
    return {
      target: this.#router(network),
      method: "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
      parameters: [
        { type: "address", value: request.token.address },
        { type: "uint256", value: request.amountTokenDesired },
        { type: "uint256", value: request.amountTokenMin },
        { type: "uint256", value: request.amountNativeMin },
        { type: "address", value: request.recipient },
        { type: "uint256", value: String(request.deadline) },
      ],
      callValueSun: request.amountNativeDesired,
    };
  }

  async v3PoolState(
    network: NetworkDescriptor,
    token0: string,
    token1: string,
    fee: number,
    check: DispatchCheck,
  ): Promise<V3PoolState> {
    const manager = this.#positionManager(network);
    const factory = await this.#read(check, network, manager, "factory()", []);
    const poolHex = await this.#read(
      check,
      network,
      addressFromWord(factory),
      "getPool(address,address,uint24)",
      [
        { type: "address", value: token0 },
        { type: "address", value: token1 },
        { type: "uint24", value: String(fee) },
      ],
    );
    if (poolHex.slice(24) === ZERO_ADDRESS_HEX) {
      return {
        poolAddress: "",
        exists: false,
        sqrtPriceX96: "0",
        currentTick: 0,
        fee,
        token0,
        liquidity: "0",
      };
    }
    const poolAddress = addressFromWord(poolHex);
    const [slot0, poolToken0, liquidity] = await Promise.all([
      this.#read(check, network, poolAddress, "slot0()", []),
      this.#read(check, network, poolAddress, "token0()", []),
      this.#read(check, network, poolAddress, "liquidity()", []),
    ]);
    return {
      poolAddress,
      exists: true,
      sqrtPriceX96: word(slot0, 0),
      currentTick: signedWord(slot0, 1),
      fee,
      token0: addressFromWord(poolToken0),
      liquidity: word(liquidity, 0),
    };
  }

  async v3Position(
    network: NetworkDescriptor,
    tokenId: string,
    check: DispatchCheck,
  ): Promise<V3Position> {
    const manager = this.#positionManager(network);
    const [positions, owner] = await Promise.all([
      this.#read(check, network, manager, "positions(uint256)", [
        { type: "uint256", value: tokenId },
      ]),
      this.#read(check, network, manager, "ownerOf(uint256)", [
        { type: "uint256", value: tokenId },
      ]),
    ]);
    // positions returns (nonce, operator, token0, token1, fee, ticks, liquidity, ...).
    assertWords(positions, 8, manager, "positions(uint256)");
    assertWords(owner, 1, manager, "ownerOf(uint256)");
    return {
      tokenId,
      owner: addressFromWord(owner),
      token0: addressFromWord(positions.slice(2 * 64, 3 * 64)),
      token1: addressFromWord(positions.slice(3 * 64, 4 * 64)),
      fee: Number(word(positions, 4)),
      tickLower: signedWord(positions, 5),
      tickUpper: signedWord(positions, 6),
      liquidity: word(positions, 7),
    };
  }

  v3Amounts(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: BaseUnits; amount1?: BaseUnits },
  ): V3AmountPlan {
    // Use the actual sqrt price; the tick is only the lower edge of its price band.
    return amountsForDeposit(poolPrice(pool), range, given);
  }

  v4Amounts(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: BaseUnits; amount1?: BaseUnits },
  ): V3AmountPlan {
    // Use the actual sqrt price; V4 deposit amounts are rounded-up spending ceilings.
    return amountsForDeposit(poolPrice(pool), range, given);
  }

  v4AmountsForLiquidity(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: BaseUnits; amount1: BaseUnits } {
    return amountsForLiquidity(poolPrice(pool), range, liquidity);
  }

  // Round up to cover the deposit cost.
  v4AmountsForLiquidityCeiling(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: BaseUnits; amount1: BaseUnits } {
    return amountsForLiquidity(poolPrice(pool), range, liquidity, true);
  }

  // Round down for withdrawal proceeds.
  v3AmountsForLiquidity(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: BaseUnits; amount1: BaseUnits } {
    return amountsForLiquidity(poolPrice(pool), range, liquidity);
  }

  // Tuple addresses must be 0x hex; the gateway converts base58 only at the top level.
  v3MintPayload(network: NetworkDescriptor, request: V3MintRequest): ContractCallPayload {
    // Sort tokens and their amounts together; the manager expects address order.
    const a = {
      token: evmAddress(request.token0.address),
      desired: request.amount0Desired,
      min: request.amount0Min,
    };
    const b = {
      token: evmAddress(request.token1.address),
      desired: request.amount1Desired,
      min: request.amount1Min,
    };
    const [first, second] = a.token.toLowerCase() < b.token.toLowerCase() ? [a, b] : [b, a];
    return {
      target: this.#positionManager(network),
      method:
        "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))",
      parameters: [
        {
          type: "tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)",
          value: [
            first.token,
            second.token,
            String(request.fee),
            String(request.tickLower),
            String(request.tickUpper),
            first.desired,
            second.desired,
            first.min,
            second.min,
            evmAddress(request.recipient),
            String(request.deadline),
          ],
        },
      ],
    };
  }

  v3IncreasePayload(network: NetworkDescriptor, request: V3IncreaseRequest): ContractCallPayload {
    return {
      target: this.#positionManager(network),
      method: "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
      parameters: [
        {
          type: "tuple(uint256,uint256,uint256,uint256,uint256,uint256)",
          value: [
            request.tokenId,
            request.amount0Desired,
            request.amount1Desired,
            request.amount0Min,
            request.amount1Min,
            String(request.deadline),
          ],
        },
      ],
    };
  }

  v2RemoveLiquidityPayload(
    network: NetworkDescriptor,
    request: V2RemoveLiquidityRequest,
  ): ContractCallPayload {
    return {
      target: this.#router(network),
      method: "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
      parameters: [
        { type: "address", value: request.token0.address },
        { type: "address", value: request.token1.address },
        { type: "uint256", value: request.liquidity },
        { type: "uint256", value: request.amount0Min },
        { type: "uint256", value: request.amount1Min },
        { type: "address", value: request.recipient },
        { type: "uint256", value: String(request.deadline) },
      ],
    };
  }

  // Returns native TRX, not WTRX.
  v2RemoveLiquidityEthPayload(
    network: NetworkDescriptor,
    request: V2RemoveLiquidityEthRequest,
  ): ContractCallPayload {
    return {
      target: this.#router(network),
      method: "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
      parameters: [
        { type: "address", value: request.token.address },
        { type: "uint256", value: request.liquidity },
        { type: "uint256", value: request.amountTokenMin },
        { type: "uint256", value: request.amountNativeMin },
        { type: "address", value: request.recipient },
        { type: "uint256", value: String(request.deadline) },
      ],
    };
  }

  // Decrease credits principal to the position; collect must follow to transfer principal and fees.
  v3RemovePayload(network: NetworkDescriptor, request: V3RemoveRequest): ContractCallPayload {
    const decrease = NonfungiblePositionManager.INTERFACE.encodeFunctionData("decreaseLiquidity", [
      {
        tokenId: request.tokenId,
        liquidity: request.liquidity,
        amount0Min: request.amount0Min,
        amount1Min: request.amount1Min,
        deadline: String(request.deadline),
      },
    ]);
    const collect = NonfungiblePositionManager.INTERFACE.encodeFunctionData("collect", [
      {
        tokenId: request.tokenId,
        recipient: evmAddress(request.recipient),
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
      },
    ]);
    return {
      target: this.#positionManager(network),
      method: "multicall(bytes[])",
      parameters: [{ type: "bytes[]", value: [decrease, collect] }],
    };
  }

  v3CollectFeesPayload(
    network: NetworkDescriptor,
    request: { tokenId: string; recipient: string },
  ): ContractCallPayload {
    return {
      target: this.#positionManager(network),
      method: "collect((uint256,address,uint128,uint128))",
      parameters: [
        {
          type: "tuple(uint256,address,uint128,uint128)",
          value: [
            request.tokenId,
            evmAddress(request.recipient),
            // A lower cap can leave fees in the position.
            MAX_UINT128,
            MAX_UINT128,
          ],
        },
      ],
    };
  }

  // Simulate collect as owner; the contract requires owner or approved-caller authorization.
  async v3OwedFees(
    network: NetworkDescriptor,
    tokenId: string,
    recipient: string,
    owner: string,
    check: DispatchCheck,
  ): Promise<{ amount0: BaseUnits; amount1: BaseUnits }> {
    const raw = await this.#read(
      check,
      network,
      this.#positionManager(network),
      "collect((uint256,address,uint128,uint128))",
      [
        {
          type: "tuple(uint256,address,uint128,uint128)",
          value: [tokenId, evmAddress(recipient), MAX_UINT128, MAX_UINT128],
        },
      ],
      owner,
    );
    return { amount0: baseUnitAmount(word(raw, 0)), amount1: baseUnitAmount(word(raw, 1)) };
  }

  async v2LiquidityResult(
    network: NetworkDescriptor,
    txId: string,
    operation: "add" | "remove",
    nativeFirst: boolean,
    check: DispatchCheck,
  ): Promise<{ amount0: BaseUnits; amount1: BaseUnits; lpAmount?: BaseUnits } | undefined> {
    const info = await this.gateways.get(network, "tron", check).getTransactionInfoById(txId);
    if (info.execution !== "success") return undefined;
    const results = info.contractResult;
    if (!Array.isArray(results) || results.length !== 1 || typeof results[0] !== "string") {
      return undefined;
    }
    const raw = results[0].replace(/^0x/, "");
    const words = operation === "add" ? 3 : 2;
    if (raw.length !== words * 64 || !/^[0-9a-f]+$/i.test(raw)) return undefined;
    return {
      amount0: baseUnitAmount(word(raw, nativeFirst ? 1 : 0)),
      amount1: baseUnitAmount(word(raw, nativeFirst ? 0 : 1)),
      ...(operation === "add" ? { lpAmount: baseUnitAmount(word(raw, 2)) } : {}),
    };
  }

  async v3DepositedAmounts(
    network: NetworkDescriptor,
    txId: string,
    check: DispatchCheck,
    tokenId?: string,
  ) {
    const manager = this.#positionManager(network);
    const info = await this.gateways.get(network, "tron", check).getTransactionInfoById(txId);
    if (info.execution !== "success" || !Array.isArray(info.log)) return undefined;
    const topic = eventTopic("IncreaseLiquidity(uint256,uint128,uint256,uint256)");
    const matches = (info.log as TronLogEntry[]).filter((entry) => {
      const topics = entry.topics ?? [];
      return (
        sameAddress("tron", String(entry.address ?? ""), manager) &&
        topics.length === 2 &&
        String(topics[0]).toLowerCase() === topic &&
        /^[0-9a-f]{64}$/i.test(String(topics[1])) &&
        (tokenId === undefined || BigInt(`0x${topics[1]}`).toString() === tokenId)
      );
    });
    if (matches.length !== 1) return undefined;
    const event = matches[0]!;
    const data = String(event.data ?? "");
    if (!/^[0-9a-f]{192}$/i.test(data)) return undefined;
    return {
      tokenId: BigInt(`0x${event.topics![1]}`).toString(),
      liquidity: word(data, 0),
      amount0: baseUnitAmount(word(data, 1)),
      amount1: baseUnitAmount(word(data, 2)),
    };
  }

  async v3CollectedAmounts(
    network: NetworkDescriptor,
    txId: string,
    tokenId: string,
    check: DispatchCheck,
  ): Promise<{ amount0: BaseUnits; amount1: BaseUnits } | undefined> {
    const manager = this.#positionManager(network);
    const info = await this.gateways.get(network, "tron", check).getTransactionInfoById(txId);
    if (info.execution !== "success" || !Array.isArray(info.log)) return undefined;
    const logs = info.log as TronLogEntry[];
    const topic = COLLECT_TOPIC.toLowerCase();
    const matches = logs.filter((entry) => {
      const topics = entry.topics ?? [];
      return (
        sameAddress("tron", String(entry.address ?? ""), manager) &&
        topics.length === 2 &&
        String(topics[0]).toLowerCase() === topic &&
        /^[0-9a-f]{64}$/i.test(String(topics[1])) &&
        BigInt(`0x${topics[1]}`).toString() === tokenId
      );
    });
    if (matches.length !== 1) return undefined;
    // Only tokenId is indexed; recipient precedes the two amounts in the data.
    const data = String(matches[0]!.data ?? "");
    if (!/^[0-9a-f]{192}$/i.test(data)) return undefined;
    return { amount0: baseUnitAmount(word(data, 1)), amount1: baseUnitAmount(word(data, 2)) };
  }

  // Use transaction logs to identify the mint; current holdings may have changed.
  async v3MintedPositionId(
    network: NetworkDescriptor,
    txId: string,
    check: DispatchCheck,
  ): Promise<string | undefined> {
    return this.#mintedPositionId(network, txId, this.#positionManager(network), check);
  }

  async v4MintedPositionId(
    network: NetworkDescriptor,
    txId: string,
    check: DispatchCheck,
  ): Promise<string | undefined> {
    return this.#mintedPositionId(network, txId, this.#v4.positionManager(network), check);
  }

  async #mintedPositionId(
    network: NetworkDescriptor,
    txId: string,
    manager: string,
    check: DispatchCheck,
  ): Promise<string | undefined> {
    const info = await this.gateways.get(network, "tron", check).getTransactionInfoById(txId);
    const logs = Array.isArray(info.log) ? (info.log as TronLogEntry[]) : [];
    for (const entry of logs) {
      const topics = entry.topics ?? [];
      if (!sameAddress("tron", String(entry.address ?? ""), manager)) continue;
      if (topics.length < 4 || String(topics[0]).toLowerCase() !== ERC721_TRANSFER_TOPIC) continue;
      if (BigInt(`0x${String(topics[1])}`) !== 0n) continue;
      return BigInt(`0x${String(topics[3])}`).toString();
    }
    return undefined;
  }

  // Use the same contract config as the SDK encoders.
  contracts(network: NetworkDescriptor): LiquidityContractAddresses {
    const name = sdkNetworkName(network) as Network;
    const address = (key: keyof ChainContracts, label: string): string => {
      const value = String(getContractAddress(name, key));
      if (value.length === 0) {
        throw new UsageError("unsupported_network", `network ${network.id} has no ${label}`);
      }
      return value;
    };
    return {
      v2Router: address("sunswapV2Router", "SunSwap V2 router"),
      v3PositionManager: address("sunswapV3PositionManager", "SunSwap V3 position manager"),
      wtrx: address("wtrx", "WTRX address"),
    };
  }

  #positionManager(network: NetworkDescriptor): string {
    return this.contracts(network).v3PositionManager;
  }

  #router(network: NetworkDescriptor): string {
    return this.contracts(network).v2Router;
  }

  async #read(
    check: DispatchCheck,
    network: NetworkDescriptor,
    contract: string,
    method: string,
    parameters: { type: string; value: unknown }[],
    from?: string,
  ): Promise<string> {
    const gateway = this.gateways.get(network, "tron", check);
    const result = await gateway.triggerConstantContract(contract, method, parameters, from);
    const value = result[0];
    if (typeof value !== "string" || value === "") {
      throw new ChainError("provider_error", `${contract} did not answer ${method}`);
    }
    return value;
  }
}

// Cap an unspecified token side at uint128 max for liquidity sizing.
const UNBOUNDED = ((1n << 128n) - 1n).toString();

// Require a nonzero sqrt price; pool creation must supply the intended initial price.
function poolPrice(pool: { sqrtPriceX96: string; exists?: boolean }): SqrtPrice {
  const price = (pool.sqrtPriceX96 ?? "").trim();
  if (!/^\d+$/.test(price) || BigInt(price) === 0n) {
    throw new ChainError(
      "pool_not_found",
      // Zero price means uninitialised; zero liquidity alone does not.
      "this pool has no price: nothing has initialised it, so there is no ratio to size a deposit against and nothing to value a position at. A pool with a price but no liquidity is a different case and is not this one",
    );
  }
  return jsbiOf(price);
}

type SqrtPrice = ReturnType<typeof TickMath.getSqrtRatioAtTick>;

// Reuse the SDK's JSBI constructor; JSBI is not a direct dependency.
function jsbiOf(value: string): ReturnType<typeof TickMath.getSqrtRatioAtTick> {
  const JSBI = TickMath.getSqrtRatioAtTick(0).constructor as unknown as {
    BigInt(value: string): ReturnType<typeof TickMath.getSqrtRatioAtTick>;
  };
  return JSBI.BigInt(value);
}

function jsbiLess(a: { toString(): string }, b: { toString(): string }): boolean {
  return BigInt(a.toString()) < BigInt(b.toString());
}
function jsbiMax<T extends { toString(): string }>(a: T, b: T): T {
  return jsbiLess(a, b) ? b : a;
}
function jsbiMin<T extends { toString(): string }>(a: T, b: T): T {
  return jsbiLess(a, b) ? a : b;
}

// ABI tuple addresses use 20-byte 0x hex.
function evmAddress(base58: string): string {
  return tronAddressToEvmHex(base58);
}

// ABI signed integers are sign-extended to 256 bits.
function signedWord(data: string, index: number): number {
  const raw = BigInt(`0x${data.slice(index * 64, (index + 1) * 64)}`);
  const signed = raw >= 1n << 255n ? raw - (1n << 256n) : raw;
  return Number(signed);
}

// Report malformed ABI data as invalid_node_response, not a missing position.
function assertWords(data: string, count: number, contract: string, method: string): void {
  if (!/^[0-9a-fA-F]*$/.test(data) || data.length < count * 64) {
    throw new ChainError(
      "invalid_node_response",
      `${contract} answered ${method} with data that cannot be decoded: expected at least ${count * 32} bytes of ABI words`,
    );
  }
}

// Read a 32-byte ABI word as a decimal string.
function word(data: string, index: number): string {
  return BigInt(`0x${data.slice(index * 64, (index + 1) * 64)}`).toString();
}

// Decode the low 20 bytes as TRON base58.
function addressFromWord(data: string): string {
  return tronAddressFromHash20(data.slice(24, 64));
}

// ABI string layout: offset, length, then bytes.
function decodeString(data: string): string {
  const length = Number(BigInt(`0x${data.slice(64, 128)}`));
  return Buffer.from(data.slice(128, 128 + length * 2), "hex").toString("utf8");
}

// Size from the current sqrt price; round up the amounts the deposit spends.
function amountsForDeposit(
  currentSqrtPriceX96: SqrtPrice,
  range: { tickLower: number; tickUpper: number },
  given: { amount0?: BaseUnits; amount1?: BaseUnits },
): V3AmountPlan {
  const current = currentSqrtPriceX96;
  const lower = TickMath.getSqrtRatioAtTick(range.tickLower);
  const upper = TickMath.getSqrtRatioAtTick(range.tickUpper);
  const takes0 = jsbiLess(current, upper);
  const takes1 = jsbiLess(lower, current);
  if (given.amount0 !== undefined && given.amount1 === undefined && !takes0) {
    throw new UsageError(
      "invalid_value",
      "the price is above this range, so the position takes only token1; give --amount1",
      { requiredAmount: "amount1" },
    );
  }
  if (given.amount1 !== undefined && given.amount0 === undefined && !takes1) {
    throw new UsageError(
      "invalid_value",
      "the price is below this range, so the position takes only token0; give --amount0",
      { requiredAmount: "amount0" },
    );
  }
  const liquidity = maxLiquidityForAmounts(
    current,
    lower,
    upper,
    given.amount0 ?? UNBOUNDED,
    given.amount1 ?? UNBOUNDED,
    true,
  );
  return {
    amount0: baseUnitAmount(
      takes0
        ? SqrtPriceMath.getAmount0Delta(jsbiMax(current, lower), upper, liquidity, true).toString()
        : "0",
    ),
    amount1: baseUnitAmount(
      takes1
        ? SqrtPriceMath.getAmount1Delta(lower, jsbiMin(current, upper), liquidity, true).toString()
        : "0",
    ),
    liquidity: liquidity.toString(),
  };
}

function amountsForLiquidity(
  currentSqrtPriceX96: SqrtPrice,
  range: { tickLower: number; tickUpper: number },
  liquidity: string,
  // Round down for withdrawal proceeds; round up for deposit ceilings.
  roundUp = false,
): { amount0: BaseUnits; amount1: BaseUnits } {
  const current = currentSqrtPriceX96;
  const lower = TickMath.getSqrtRatioAtTick(range.tickLower);
  const upper = TickMath.getSqrtRatioAtTick(range.tickUpper);
  const takes0 = jsbiLess(current, upper);
  const takes1 = jsbiLess(lower, current);
  const burned = jsbiOf(liquidity);
  return {
    amount0: baseUnitAmount(
      takes0
        ? SqrtPriceMath.getAmount0Delta(jsbiMax(current, lower), upper, burned, roundUp).toString()
        : "0",
    ),
    amount1: baseUnitAmount(
      takes1
        ? SqrtPriceMath.getAmount1Delta(lower, jsbiMin(current, upper), burned, roundUp).toString()
        : "0",
    ),
  };
}
