/**
 * Creating a token on SunPump — the one write in this version that this CLI does not perform.
 *
 * The service creates the token, chooses its owner and pays for it. Nothing here signs, nothing
 * broadcasts, no account is resolved and no fee is estimated: there is no transaction to attach
 * any of that to. That is why this does not go near `TxPipeline`, and why the receipt has no
 * stage, no confirmation and no `txId` of our making — `createTxHash` is the service's, and
 * whether it is on chain yet is a question for `tx info`.
 *
 * What this layer owns is the request body and the preview of it. Both come from ONE assembled
 * request, so `--dry-run` cannot show a field the real call would not send, or hide one it would.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { SunPumpTokenRecord } from "../../../ports/sunpump/market-data.js";
import type {
  SunPumpTokenLaunchPort,
  SunPumpTokenLaunchRequest,
} from "../../../ports/sunpump/token-launch.js";

/**
 * The logo, already read.
 *
 * Reading a path is the CLI's job, so the bytes arrive here base64-encoded either way and the
 * source is carried only so the preview can say which it was. `bytes` is the file's size on disk,
 * which is what a person recognises; the base64 length is a third larger and means nothing to
 * them.
 */
export type SunPumpLaunchImage =
  | {
      readonly source: "file";
      readonly path: string;
      readonly bytes: number;
      readonly base64: string;
    }
  | { readonly source: "base64"; readonly base64: string };

export interface SunPumpLaunchInput {
  readonly name: string;
  readonly symbol: string;
  readonly description: string;
  readonly image?: SunPumpLaunchImage;
  readonly twitterUrl?: string;
  readonly telegramUrl?: string;
  readonly websiteUrl?: string;
  /** validate and preview only: nothing is sent to the create endpoint. */
  readonly dryRun: boolean;
}

/** what the preview says about the logo — the file's name and size, or the string's length. */
export type SunPumpLaunchImagePreview =
  | { readonly source: "file"; readonly path: string; readonly bytes: number }
  | { readonly source: "base64"; readonly chars: number };

export interface SunPumpLaunchLinks {
  readonly website?: string;
  readonly twitter?: string;
  readonly telegram?: string;
}

/**
 * The receipt for a created token.
 *
 * `token.owner` is the CREATOR THE SERVICE CHOSE. It is not this CLI's active account and the new
 * token is not tied to one, which is why the receipt leads with it rather than leaving a reader to
 * assume the coin is theirs.
 */
export interface SunPumpLaunchResult {
  readonly kind: "sunpump-launch";
  readonly token: SunPumpTokenRecord;
}

/** The preview: exactly the fields the request would carry, and nothing a launch has not got. */
export interface SunPumpLaunchPreview {
  readonly kind: "sunpump-launch";
  readonly mode: "dry-run";
  readonly name: string;
  readonly symbol: string;
  readonly description: string;
  readonly image?: SunPumpLaunchImagePreview;
  readonly links?: SunPumpLaunchLinks;
}

export type SunPumpLaunchView = SunPumpLaunchResult | SunPumpLaunchPreview;

export class SunPumpTokenLaunchService {
  constructor(private readonly launchpad: SunPumpTokenLaunchPort) {}

  async launch(network: NetworkDescriptor, input: SunPumpLaunchInput): Promise<SunPumpLaunchView> {
    const request = buildRequest(input);
    if (input.dryRun) return preview(request, input.image);
    const token = await this.launchpad.launchToken(network, request);
    return { kind: "sunpump-launch", token };
  }
}

/**
 * The body, with every absent option OMITTED rather than sent empty.
 *
 * This service ignores what it does not understand and accepts what it does, so an empty string
 * would become a token whose website is "". There is no flag for the SDK's `tweetUsername`, and a
 * field nobody can set does not belong in the request.
 */
function buildRequest(input: SunPumpLaunchInput): SunPumpTokenLaunchRequest {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    ...(input.image === undefined ? {} : { imageBase64: input.image.base64 }),
    ...(input.twitterUrl === undefined ? {} : { twitterUrl: input.twitterUrl }),
    ...(input.telegramUrl === undefined ? {} : { telegramUrl: input.telegramUrl }),
    ...(input.websiteUrl === undefined ? {} : { websiteUrl: input.websiteUrl }),
  };
}

/**
 * The preview, read off the assembled request.
 *
 * Deliberately not off the input: a field the request forgot to carry would otherwise still be
 * shown, and the whole point of the preview is that it is what would be sent.
 */
function preview(
  request: SunPumpTokenLaunchRequest,
  image: SunPumpLaunchImage | undefined,
): SunPumpLaunchPreview {
  const links: SunPumpLaunchLinks = {
    ...(request.websiteUrl === undefined ? {} : { website: request.websiteUrl }),
    ...(request.twitterUrl === undefined ? {} : { twitter: request.twitterUrl }),
    ...(request.telegramUrl === undefined ? {} : { telegram: request.telegramUrl }),
  };
  return {
    kind: "sunpump-launch",
    mode: "dry-run",
    name: request.name,
    symbol: request.symbol,
    description: request.description,
    ...(image === undefined || request.imageBase64 === undefined
      ? {}
      : { image: imagePreview(image) }),
    ...(Object.keys(links).length === 0 ? {} : { links }),
  };
}

function imagePreview(image: SunPumpLaunchImage): SunPumpLaunchImagePreview {
  return image.source === "file"
    ? { source: "file", path: image.path, bytes: image.bytes }
    : { source: "base64", chars: image.base64.length };
}
