import type { NetworkDescriptor } from "../../domain/types/index.js";

/**
 * An unsigned TRON contract call, in the shape `TxPipeline`'s build step takes.
 *
 * It lives here rather than inside any one protocol's port because it is not a fact about
 * SunSwap or SunPump — it is how every TRON contract call is described in this codebase.
 *
 * Parameters are `{type, value}` pairs rather than pre-encoded calldata on purpose: the gateway
 * encodes them, so there is one ABI encoder in this process instead of a second hand-rolled one
 * whose mistakes would be a wrong call rather than a compile error.
 */
export interface ContractCallPayload {
  /** the contract to call, base58. */
  readonly target: string;
  /** e.g. `purchaseToken(address,uint256)` — a full signature, not a selector. */
  readonly method: string;
  readonly parameters: readonly ContractParameter[];
  /** TRX sent with the call, in SUN; absent for a pure token call. */
  readonly callValueSun?: string;
}

/**
 * One `{type, value}` pair for the gateway's encoder.
 *
 * A struct argument — V3's `mint` takes one — arrives as an array of the member values, which is
 * why `value` is not simply a string.
 */
export interface ContractParameter {
  readonly type: string;
  readonly value: string | readonly string[];
}

/**
 * The two things a port must offer for the shared approval sequence to work with it.
 *
 * Narrower than any one protocol's port on purpose: the approve/confirm/re-read sequence is the
 * same whether the spender is a SunSwap router or a SunPump proxy, and a helper typed against a
 * whole port could not be shared between them. Any port with these two members satisfies it
 * structurally, so nothing had to change to opt in.
 */
export type ApprovalDomain = "sunpump-launchpad" | "sunswap-contracts";

export interface ApprovalCapablePort {
  /**
   * Which protocol's contracts this port speaks to.
   *
   * Structural typing alone let a completely wrong collaborator satisfy this interface: a SunSwap
   * swap was built on the SunPump launchpad port, compiled, ran, and re-read an allowance from
   * another protocol's contracts without anything objecting. The brand makes the two ports
   * distinguishable, so `LiquidityTransactions<"sunswap-contracts">` cannot be built from the
   * launchpad port and the next market wired in hits a compile error rather than the same silence.
   */
  readonly approvalDomain: ApprovalDomain;

  /** how much of `token` `spender` may currently move on `owner`'s behalf, in base units. */
  allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
  ): Promise<string>;

  approvalPayload(
    network: NetworkDescriptor,
    token: string,
    spender: string,
    amount: string,
  ): ContractCallPayload;
}
