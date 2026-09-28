/**
 * LiquidityPort over the TRON gateway's contract calls.
 *
 * Shape and encoding only. Which deposit is legal, what a minimum should be and whether an
 * approval is needed are decisions, and they live in the use case above; this file knows how to
 * ask a contract a question and how to spell a call.
 *
 * Two rules it does enforce, because they are properties of the encoding rather than of the
 * decision:
 *
 * - Token facts come from the TOKEN CONTRACT, never from a market DTO. `decimals` converts a
 *   human amount into base units, so a wrong one moves the decimal point on somebody's deposit.
 * - Amounts cross as decimal strings and are parsed with `BigInt`. A `number` would silently
 *   round a balance past fifteen digits.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  maxLiquidityForAmounts,
  NonfungiblePositionManager,
  SqrtPriceMath,
  TickMath,
} from "@sun-protocol/sun-sdk-sunswap-v3";
import type {
  ContractCallPayload,
  LiquidityPort,
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
  V4IncreaseRequest,
  V4RemoveRequest,
  V4OwedFees,
  V4OwedFeesQuery,
  V4PoolState,
  V4Position,
} from "../../../application/ports/sunswap/liquidity.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import { SunSwapV4Contracts } from "./v4-contracts.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import {
  tronAddressBytes,
  tronBytesToBase58,
  tronHexAddress,
} from "../../../domain/address/index.js";

/** A pair the factory has never created answers with the zero address, not with an error. */
const ZERO_ADDRESS_HEX = "0".repeat(40);

/** One entry of a TRON transaction's event log, as the node reports it. */
interface TronLogEntry {
  readonly address?: string;
  readonly topics?: readonly string[];
  readonly data?: string;
}

/** Everything the position is owed — capping it lower would strand the caller's own money. */
const MAX_UINT128 = ((1n << 128n) - 1n).toString();

/**
 * The topic of the manager's `Collect` event — COMPUTED, not transcribed.
 *
 * The SDK's interface does not carry this event, and a hand-copied 32-byte hash is a constant
 * nobody can check by reading it. Hashing the signature costs one call at module load and is
 * verifiable by anyone who knows what keccak is.
 */
const COLLECT_TOPIC = eventTopic("Collect(uint256,address,uint256,uint256)");

/** An event's log topic: keccak256 of its signature, in the form the node reports log
 *  topics — no leading 0x. */
function eventTopic(signature: string): string {
  return bytesToHex(keccak_256(utf8ToBytes(signature)));
}

/** The ERC-721 event a mint emits, computed for the same reason as `COLLECT_TOPIC`. */
const ERC721_TRANSFER_TOPIC = eventTopic("Transfer(address,address,uint256)");

export class SunSwapLiquidityContracts implements LiquidityPort {
  readonly approvalDomain = "sunswap-contracts" as const;

  /**
   * V4's reads, which live in their own file.
   *
   * Delegated rather than inlined: V4 identifies a pool by a 32-byte id and packs a position's range
   * into one word, so its helpers share nothing with V2's pairs or V3's fields. Keeping them apart is
   * what stops this file becoming the place a reader has to work out which protocol a helper is for.
   */
  readonly #v4: SunSwapV4Contracts;

  constructor(private readonly gateways: ChainGatewayProvider) {
    this.#v4 = new SunSwapV4Contracts(gateways);
  }

  async v4PoolState(network: NetworkDescriptor, poolId: string): Promise<V4PoolState> {
    return this.#v4.poolState(network, poolId);
  }

  async v4Position(network: NetworkDescriptor, tokenId: string): Promise<V4Position> {
    return this.#v4.position(network, tokenId);
  }

  async v4OwedFees(
    network: NetworkDescriptor,
    position: V4OwedFeesQuery,
  ): Promise<V4OwedFees | undefined> {
    return this.#v4.owedFees(network, position);
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

  async tokenFacts(network: NetworkDescriptor, address: string): Promise<TokenFacts> {
    const [decimals, symbol] = await Promise.all([
      this.#read(network, address, "decimals()", []),
      this.#read(network, address, "symbol()", []),
    ]);
    return {
      address,
      decimals: Number(BigInt(`0x${decimals}`)),
      symbol: decodeString(symbol),
    };
  }

  /**
   * `name()`, and nothing breaks when the token has not got one.
   *
   * `name` is optional in TRC-20. A token that does not implement it reverts, and this is the only
   * place in the group that wants it, so the failure is swallowed into `undefined` rather than
   * allowed to refuse a read-only query over a display string.
   */
  async tokenName(network: NetworkDescriptor, address: string): Promise<string | undefined> {
    try {
      return decodeString(await this.#read(network, address, "name()", [])) || undefined;
    } catch {
      return undefined;
    }
  }

  /** `name()` / `symbol()` off the protocol's position-manager NFT — asked, never assumed. */
  async positionNftFacts(
    network: NetworkDescriptor,
    protocol: "V3" | "V4",
  ): Promise<{ name: string; symbol: string }> {
    const manager =
      protocol === "V4" ? this.v4PositionManager(network) : this.#positionManager(network);
    const [name, symbol] = await Promise.all([
      this.#read(network, manager, "name()", []),
      this.#read(network, manager, "symbol()", []),
    ]);
    return { name: decodeString(name), symbol: decodeString(symbol) };
  }

  async v2PairState(
    network: NetworkDescriptor,
    token0: string,
    token1: string,
  ): Promise<V2PairState> {
    const factory = await this.#read(network, this.#router(network), "factory()", []);
    const pairHex = await this.#read(
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
      this.#read(network, pairAddress, "getReserves()", []),
      this.#read(network, pairAddress, "totalSupply()", []),
      this.#read(network, pairAddress, "token0()", []),
      // Asked rather than assumed. The LP token scales what the caller is told they will receive,
      // and a pair that does not use 18 would move that decimal point.
      this.#read(network, pairAddress, "decimals()", []),
    ]);
    // The pair stores its reserves in ITS OWN token order, which is the sorted one and need not
    // match the order the caller named. Reading token0() and swapping is what keeps a deposit
    // from being paired against the wrong reserve.
    const [reserveA, reserveB] = [word(reserves, 0), word(reserves, 1)];
    const sameOrder = addressFromWord(pairToken0).toLowerCase() === token0.toLowerCase();
    return {
      pairAddress,
      reserve0: sameOrder ? reserveA : reserveB,
      reserve1: sameOrder ? reserveB : reserveA,
      totalSupply: BigInt(`0x${supply}`).toString(),
      lpDecimals: Number(BigInt(`0x${lpDecimals}`)),
      exists: true,
    };
  }

  async balanceOf(network: NetworkDescriptor, token: string, owner: string): Promise<string> {
    const raw = await this.#read(network, token, "balanceOf(address)", [
      { type: "address", value: owner },
    ]);
    return BigInt(`0x${raw}`).toString();
  }

  /** Native TRX, so there is no contract to ask — the account itself carries the balance. */
  async nativeBalance(network: NetworkDescriptor, owner: string): Promise<string> {
    const account = await this.gateways.get(network, "tron").getAccount(owner);
    return String(account.balance ?? "0");
  }

  async allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
  ): Promise<string> {
    const raw = await this.#read(network, token, "allowance(address,address)", [
      { type: "address", value: owner },
      { type: "address", value: spender },
    ]);
    return BigInt(`0x${raw}`).toString();
  }

  /**
   * An approval for EXACTLY the amount the call needs.
   *
   * Not `MAX_UINT256`: an unbounded approval leaves the router able to move that token forever,
   * and this path has a known amount, so there is nothing to gain by granting more.
   */
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

  /**
   * `addLiquidityETH(address,uint256,uint256,uint256,address,uint256)`, payable.
   *
   * The TRX amount is the call's VALUE, not an argument, which is why this cannot be folded into
   * the call above: a signature that carried it as a uint256 would build, broadcast, and deposit
   * nothing.
   */
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

  // ── V3 ────────────────────────────────────────────────────────────────────

  async v3PoolState(
    network: NetworkDescriptor,
    token0: string,
    token1: string,
    fee: number,
  ): Promise<V3PoolState> {
    const manager = this.#positionManager(network);
    const factory = await this.#read(network, manager, "factory()", []);
    const poolHex = await this.#read(
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
      this.#read(network, poolAddress, "slot0()", []),
      this.#read(network, poolAddress, "token0()", []),
      // The pool's active liquidity, which V4's state read already returns and V3's did not.
      // One more constant call in a batch that was already being awaited together.
      this.#read(network, poolAddress, "liquidity()", []),
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

  async v3Position(network: NetworkDescriptor, tokenId: string): Promise<V3Position> {
    const manager = this.#positionManager(network);
    const [positions, owner] = await Promise.all([
      this.#read(network, manager, "positions(uint256)", [{ type: "uint256", value: tokenId }]),
      this.#read(network, manager, "ownerOf(uint256)", [{ type: "uint256", value: tokenId }]),
    ]);
    // (nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, …)
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

  /**
   * How a deposit lands in a range.
   *
   * The Uniswap v3 arithmetic is the SDK's, and this is the only layer allowed to reach for it.
   * What is ours — which tiers exist, what spacing each imposes, whether a tick is aligned —
   * stays in the domain, because none of that needs a vendor.
   *
   * A range the price has moved out of takes ONE side only. Naming just the other side cannot be
   * answered: there is no amount of it the pool would accept, so it is refused with the reason
   * rather than sized to zero.
   */
  v3Amounts(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: string; amount1?: string },
  ): V3AmountPlan {
    // The pool's OWN price, as V4 uses. This used to be the tick's price — the lower edge of a band —
    // and on V3 that is safe in the sense that nothing reverts, because V3 bounds from below. It is
    // still WRONG: the caller deposits a pair ratio they did not ask for and takes less liquidity
    // than their money should buy. Measured at 1.73% on a 35-tick offset, and worse as the range
    // narrows, which is the ordinary case for concentrated liquidity.
    return amountsForDeposit(poolPrice(pool), range, given);
  }

  /**
   * The same arithmetic for a V4 pool, and it really is the same.
   *
   * Concentrated liquidity does not change between V3 and V4: the amounts follow from the current
   * sqrt price and the range's two sqrt prices, and nothing in these formulas knows which protocol
   * asked. What differs is around them — a V4 range aligns to the POOL's own tick spacing rather than
   * one implied by the fee tier, and TRX stays native — and that is the caller's business, not the
   * arithmetic's.
   *
   * So this shares the implementation rather than restating it. Two copies of money maths that were
   * meant to agree is how the two of them stop agreeing.
   */
  v4Amounts(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: string; amount1?: string },
  ): V3AmountPlan {
    // THE POOL'S ACTUAL PRICE, not its tick's. Measured on Nile: sizing from the tick understated
    // amount1 by 1.73% and the mint REVERTED with the contract's own figures — max 170007 against
    // 172953 required. The tick is the lower edge of a price band, and the error is amplified when
    // the range is narrow: this one spanned 35 ticks above its lower bound, so a sub-tick difference
    // in the price moved amount1 by nearly a fortieth.
    //
    // V3 gets away with the tick because it bounds from BELOW. V4 bounds from ABOVE, so the same
    // imprecision stops being conservative and starts being a ceiling the contract cannot fit under.
    //
    // Once the price is the pool's own, THESE AMOUNTS ARE THE CEILING. The contract recomputes what
    // the liquidity costs at that same price, rounding up, which is what this already did — verified
    // to the unit against the revert data. No separate ceiling calculation is needed, and one would
    // only be a second place for the two to drift apart.
    return amountsForDeposit(poolPrice(pool), range, given);
  }

  v4AmountsForLiquidity(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: string; amount1: string } {
    return amountsForLiquidity(poolPrice(pool), range, liquidity);
  }

  /**
   * What a given liquidity COSTS, rounded up — the same figures the contract will demand.
   *
   * The mirror of `v4AmountsForLiquidity`, which rounds down because it answers what a withdrawal is
   * worth. This answers what a deposit must be allowed to spend, so it rounds the other way. The two
   * directions are one implementation with the rounding as its argument, rather than two bodies that
   * have to be kept agreeing.
   *
   * Needed where the caller supplies the liquidity rather than the amounts — an increase — since
   * there is no plan to take the ceiling from.
   */
  v4AmountsForLiquidityCeiling(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: string; amount1: string } {
    return amountsForLiquidity(poolPrice(pool), range, liquidity, true);
  }

  /**
   * What a slice of a position's liquidity is worth right now.
   *
   * Rounded DOWN, unlike the deposit side: this is what the caller will RECEIVE, and promising
   * a unit the pool will not pay is the direction that disappoints. Below the range it is all
   * token0, above it all token1 — the same three cases, read the other way.
   */
  v3AmountsForLiquidity(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: string; amount1: string } {
    // The pool's own price here too. This figure goes in front of a person in a receipt, so "wrong
    // in the conservative direction" is not good enough for it.
    return amountsForLiquidity(poolPrice(pool), range, liquidity);
  }

  /**
   * `mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))`.
   *
   * The argument is a STRUCT, and inside one an address must be 0x-hex: the gateway converts a
   * base58 address for a top-level parameter and hands struct members straight to the ABI coder,
   * which does not know base58. It throws rather than encoding something wrong, so this is a
   * build-time rule and not a way to lose money — but it is why `evmWord` is here.
   */
  v3MintPayload(network: NetworkDescriptor, request: V3MintRequest): ContractCallPayload {
    // A pool key is SORTED, and the manager sorts the pair itself before it reads the amounts —
    // so `amount0Desired` means "the smaller address's amount", not "the first one named". Handing
    // it the caller's order would pair each amount with the wrong token, and the deposit would
    // succeed at the wrong size. Sorting here keeps that rule in the one place that encodes it.
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

  /** `increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))`. */
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

  /** The mirror of `addLiquidityETH`: the TRX side comes back as native TRX, not as WTRX. */
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

  /**
   * `multicall(bytes[])` carrying `decreaseLiquidity` then `collect`, in that order.
   *
   * Order is the whole point: `decreaseLiquidity` credits the position's owed balances and
   * transfers nothing, and `collect` is what moves tokens to the recipient. Sent alone, the
   * first one leaves a user with a successful transaction and no tokens.
   *
   * The two inner calls are encoded by the SDK's own interface and the outer one by the gateway,
   * so no hand-written encoder appears on either side.
   */
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
    // MAX_UINT128 asks for everything the position is owed, which after the decrease above is
    // the principal it just freed PLUS the fees it had accrued. Capping it lower would leave
    // part of the user's own money in the contract.
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
            // Everything owed. There is no partial collect, and capping it lower would leave
            // part of the caller's own fees in the contract.
            MAX_UINT128,
            MAX_UINT128,
          ],
        },
      ],
    };
  }

  /**
   * What the position could collect right now.
   *
   * A static `collect` for the maximum: the contract computes what is owed and returns it
   * without moving anything, which is the only way to learn the figure before the transaction
   * that would merge it with the principal.
   */
  async v3OwedFees(
    network: NetworkDescriptor,
    tokenId: string,
    recipient: string,
  ): Promise<{ amount0: string; amount1: string }> {
    const raw = await this.#read(
      network,
      this.#positionManager(network),
      "collect((uint256,address,uint128,uint128))",
      [
        {
          type: "tuple(uint256,address,uint128,uint128)",
          value: [tokenId, evmAddress(recipient), MAX_UINT128, MAX_UINT128],
        },
      ],
    );
    return { amount0: word(raw, 0), amount1: word(raw, 1) };
  }

  /** What a confirmed removal transferred, from the manager's own `Collect` event. */
  async v3CollectedAmounts(
    network: NetworkDescriptor,
    txId: string,
  ): Promise<{ amount0: string; amount1: string } | undefined> {
    const manager = this.#positionManager(network);
    const managerHex = tronHexAddress(manager).slice(2).toLowerCase();
    const info = await this.gateways.get(network, "tron").getTransactionInfoById(txId);
    const logs = Array.isArray(info.log) ? (info.log as TronLogEntry[]) : [];
    const topic = COLLECT_TOPIC.toLowerCase();
    for (const entry of logs) {
      const topics = entry.topics ?? [];
      if (String(entry.address ?? "").toLowerCase() !== managerHex) continue;
      if (String(topics[0] ?? "").toLowerCase() !== topic) continue;
      // Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1):
      // only the id is indexed, so the two amounts are the second and third data words.
      const data = String(entry.data ?? "");
      return { amount0: word(data, 1), amount1: word(data, 2) };
    }
    return undefined;
  }

  /**
   * The minted position's id, from the ERC-721 `Transfer` the manager emits.
   *
   * A mint is a transfer FROM the zero address, which is what distinguishes creating a position
   * from moving one, and the token id is the third indexed topic. Read from the log rather than
   * from an enumeration call, because a log names what THIS transaction did while an enumeration
   * only says what the account holds now.
   */
  async v3MintedPositionId(network: NetworkDescriptor, txId: string): Promise<string | undefined> {
    const manager = this.#positionManager(network);
    const managerHex = tronHexAddress(manager).slice(2).toLowerCase();
    const info = await this.gateways.get(network, "tron").getTransactionInfoById(txId);
    // `TronTxInfo` is open-ended, so the log is narrowed here rather than assumed.
    const logs = Array.isArray(info.log) ? (info.log as TronLogEntry[]) : [];
    for (const entry of logs) {
      const topics = entry.topics ?? [];
      if (String(entry.address ?? "").toLowerCase() !== managerHex) continue;
      if (topics.length < 4 || String(topics[0]).toLowerCase() !== ERC721_TRANSFER_TOPIC) continue;
      if (BigInt(`0x${String(topics[1])}`) !== 0n) continue;
      return BigInt(`0x${String(topics[3])}`).toString();
    }
    return undefined;
  }

  #positionManager(network: NetworkDescriptor): string {
    const manager = isTronNetwork(network)
      ? network.sunswap?.contracts?.v3PositionManager
      : undefined;
    if (!manager) {
      throw new UsageError(
        "unsupported_network",
        `network ${network.id} has no SunSwap V3 position manager configured`,
      );
    }
    return manager;
  }

  #router(network: NetworkDescriptor): string {
    const router = isTronNetwork(network) ? network.sunswap?.contracts?.v2Router : undefined;
    if (!router) {
      throw new UsageError(
        "unsupported_network",
        `network ${network.id} has no SunSwap V2 router configured`,
      );
    }
    return router;
  }

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

/** Larger than any token supply, so an unnamed side never limits the liquidity. */
const UNBOUNDED = ((1n << 128n) - 1n).toString();

/**
 * A decimal string as the SDK's own number type.
 *
 * The SDK's arithmetic takes JSBI, `jsbi` is not a direct dependency of ours, and the SDK does
 * not re-export it — so the constructor is taken from a value the SDK itself produced rather
 * than by reaching into a package we do not declare. The deposit path never needs this, because
 * there the liquidity comes back from the SDK already; only a withdrawal starts from a number
 * the caller named. A test pins it, because a reflective lookup that silently stopped working
 * would otherwise surface as arithmetic.
 */
/**
 * A pool's price, refused when it has none.
 *
 * A HAZARD THAT ARRIVED WITH THE FIX: `v3PoolState` reports `sqrtPriceX96: "0"` for a pool the
 * factory has never created, and V4 reports the same for one nothing has initialised. The tick-edge
 * version never had a zero to worry about — the sqrt ratio at tick 0 is a real price — so feeding a
 * zero into the arithmetic is a new way to get a plausible answer out of nothing.
 *
 * `--create-pool` MUST NOT COME THROUGH HERE. It sizes a deposit into a pool that does not exist yet,
 * against the price the caller supplied with `--sqrt-price` — which is why those two flags travel
 * together. Reading the chain's state on that path would produce a zero and refuse the one caller who
 * is entitled to proceed. It builds its pool state from the supplied price instead.
 */
function poolPrice(pool: { sqrtPriceX96: string; exists?: boolean }): SqrtPrice {
  const price = (pool.sqrtPriceX96 ?? "").trim();
  if (!/^\d+$/.test(price) || BigInt(price) === 0n) {
    throw new ChainError(
      "pool_not_found",
      // "nothing has been deposited" would be wrong, and wrong in a way a reader could act on: a V4
      // pool can be initialised — and so have a real price — while holding no liquidity at all. A
      // zero price means nothing has INITIALISED it, which is a different thing to fix.
      "this pool has no price: nothing has initialised it, so there is no ratio to size a deposit against and nothing to value a position at. A pool with a price but no liquidity is a different case and is not this one",
    );
  }
  return jsbiOf(price);
}

/**
 * The SDK's own number type, named rather than imported.
 *
 * `jsbi` is not a direct dependency here on purpose — the vendor's numbers are only ever produced by
 * the vendor and passed back to it — so the type is taken from a call rather than from an import.
 */
type SqrtPrice = ReturnType<typeof TickMath.getSqrtRatioAtTick>;

function jsbiOf(value: string): ReturnType<typeof TickMath.getSqrtRatioAtTick> {
  const JSBI = TickMath.getSqrtRatioAtTick(0).constructor as unknown as {
    BigInt(value: string): ReturnType<typeof TickMath.getSqrtRatioAtTick>;
  };
  return JSBI.BigInt(value);
}

/** The SDK's numbers are JSBI, which has no operators — these three keep the comparisons honest
 *  without constructing one of our own. */
function jsbiLess(a: { toString(): string }, b: { toString(): string }): boolean {
  return BigInt(a.toString()) < BigInt(b.toString());
}
function jsbiMax<T extends { toString(): string }>(a: T, b: T): T {
  return jsbiLess(a, b) ? b : a;
}
function jsbiMin<T extends { toString(): string }>(a: T, b: T): T {
  return jsbiLess(a, b) ? a : b;
}

/** A base58 TRON address as the 0x-hex an ABI struct member must carry. */
function evmAddress(base58: string): string {
  return `0x${Buffer.from(tronAddressBytes(base58)).toString("hex").slice(2)}`;
}

/** an ABI word read as a SIGNED integer — ticks are int24 and are routinely negative. */
function signedWord(data: string, index: number): number {
  const raw = BigInt(`0x${data.slice(index * 64, (index + 1) * 64)}`);
  const signed = raw >= 1n << 255n ? raw - (1n << 256n) : raw;
  return Number(signed);
}

/** the 32-byte word at `index` of an ABI return, as a decimal string. */
function word(data: string, index: number): string {
  return BigInt(`0x${data.slice(index * 64, (index + 1) * 64)}`).toString();
}

/** an address-typed ABI word: the low 20 bytes, as a TRON base58 address. */
function addressFromWord(data: string): string {
  const hex = `41${data.slice(24, 64)}`;
  return tronBytesToBase58(Uint8Array.from(Buffer.from(hex, "hex")));
}

/** an ABI string return: offset, length, then the bytes. */
function decodeString(data: string): string {
  const length = Number(BigInt(`0x${data.slice(64, 128)}`));
  return Buffer.from(data.slice(128, 128 + length * 2), "hex").toString("utf8");
}

/**
 * What a deposit into a range becomes, and the liquidity it funds.
 *
 * Protocol-neutral by construction: it takes the pool's current TICK and nothing else about the
 * pool, because that is all concentrated-liquidity arithmetic needs. V3 and V4 both call it.
 *
 * Rounded UP — this is what the caller will SPEND, and understating it is the direction that fails
 * at the contract rather than merely disappointing.
 */
function amountsForDeposit(
  currentSqrtPriceX96: SqrtPrice,
  range: { tickLower: number; tickUpper: number },
  given: { amount0?: string; amount1?: string },
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
    );
  }
  if (given.amount1 !== undefined && given.amount0 === undefined && !takes1) {
    throw new UsageError(
      "invalid_value",
      "the price is below this range, so the position takes only token0; give --amount0",
    );
  }
  // An unnamed side is unbounded, so the named one is what limits the liquidity.
  const liquidity = maxLiquidityForAmounts(
    current,
    lower,
    upper,
    given.amount0 ?? UNBOUNDED,
    given.amount1 ?? UNBOUNDED,
    true,
  );
  return {
    amount0: takes0
      ? SqrtPriceMath.getAmount0Delta(jsbiMax(current, lower), upper, liquidity, true).toString()
      : "0",
    amount1: takes1
      ? SqrtPriceMath.getAmount1Delta(lower, jsbiMin(current, upper), liquidity, true).toString()
      : "0",
    liquidity: liquidity.toString(),
  };
}

/**
 * What a slice of liquidity is worth right now. The mirror of `amountsForDeposit`, and shared the
 * same way — a withdrawal's arithmetic does not know which protocol holds the position either.
 *
 * Rounded DOWN, because this is what the caller RECEIVES.
 */
function amountsForLiquidity(
  currentSqrtPriceX96: SqrtPrice,
  range: { tickLower: number; tickUpper: number },
  liquidity: string,
  /**
   * Which way the error points, and it is chosen per PATH rather than per protocol.
   *
   * DOWN by default, because the default caller is a withdrawal: the figure is what a person is told
   * they will RECEIVE, and the bound protecting them is a floor, so an error must point down or the
   * floor promises a unit the pool will not pay. UP for a deposit ceiling, where the bound sits on the
   * other side and an error pointing down is the one that reverts.
   *
   * The rule this comes from: before reusing an estimate, ask which direction its error points and
   * which direction that path's bound protects. A V4 mint reverted on getting that backwards.
   */
  roundUp = false,
): { amount0: string; amount1: string } {
  const current = currentSqrtPriceX96;
  const lower = TickMath.getSqrtRatioAtTick(range.tickLower);
  const upper = TickMath.getSqrtRatioAtTick(range.tickUpper);
  const takes0 = jsbiLess(current, upper);
  const takes1 = jsbiLess(lower, current);
  const burned = jsbiOf(liquidity);
  return {
    amount0: takes0
      ? SqrtPriceMath.getAmount0Delta(jsbiMax(current, lower), upper, burned, roundUp).toString()
      : "0",
    amount1: takes1
      ? SqrtPriceMath.getAmount1Delta(lower, jsbiMin(current, upper), burned, roundUp).toString()
      : "0",
  };
}
