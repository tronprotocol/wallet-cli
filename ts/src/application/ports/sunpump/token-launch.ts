/**
 * SunPumpTokenLaunchPort — creating a token on the SunPump launchpad.
 *
 * Unlike every other write in this codebase, the SERVICE creates the token. Nothing is signed
 * here, nothing is broadcast, no fee is paid by the caller, and the request carries NO address:
 * the creator (`owner` on the returned token) is chosen by SunPump and is not this CLI's active
 * account. That is why this is a port of its own rather than a member of `LaunchpadPort`, which
 * speaks to the curve contract with a signer.
 *
 * The answer is one token, in the SAME shape the catalogue publishes, so what a caller reads back
 * from `sunpump token-info` a minute later cannot have a different structure from the receipt.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { SunPumpTokenRecord } from "./market-data.js";

/**
 * Exactly what the create endpoint is sent.
 *
 * Every member is a field of the request body. There is deliberately no address, no account and
 * no amount: the body the service accepts has none, and adding one would be silently dropped —
 * this service ignores what it does not understand rather than rejecting it.
 *
 * `imageBase64` is the logo's bytes, base64-encoded, with no `data:` prefix. Where those bytes
 * came from — a local file or a string on the command line — is the CLI's business, not the
 * service's.
 */
export interface SunPumpTokenLaunchRequest {
  readonly name: string;
  readonly symbol: string;
  readonly description: string;
  readonly imageBase64?: string;
  readonly twitterUrl?: string;
  readonly telegramUrl?: string;
  readonly websiteUrl?: string;
}

export interface SunPumpTokenLaunchPort {
  /**
   * Create a token, and answer with the token the service created.
   *
   * It resolves only when the service reported a created token. A refusal arrives as a non-zero
   * code inside an HTTP 200, so an implementation that does not translate that would report a
   * token that does not exist — the one failure this port must never have.
   */
  launchToken(
    network: NetworkDescriptor,
    request: SunPumpTokenLaunchRequest,
  ): Promise<SunPumpTokenRecord>;
}
