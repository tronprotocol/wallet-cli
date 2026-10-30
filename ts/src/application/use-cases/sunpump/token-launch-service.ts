// SunPump creates and pays for the token; no local transaction is signed.
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { SunPumpTokenRecord } from "../../ports/sunpump/market-data.js";
import type {
  SunPumpTokenLaunchPort,
  SunPumpTokenLaunchRequest,
} from "../../ports/sunpump/token-launch.js";

// File bytes are read by the caller and supplied as base64.
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
  // Preview only; do not call the create endpoint.
  readonly dryRun: boolean;
}

export type SunPumpLaunchImagePreview =
  | { readonly source: "file"; readonly path: string; readonly bytes: number }
  | { readonly source: "base64"; readonly chars: number };

export interface SunPumpLaunchLinks {
  readonly website?: string;
  readonly twitter?: string;
  readonly telegram?: string;
}

// token.owner is chosen by SunPump, independently of the active account.
export interface SunPumpLaunchResult {
  readonly kind: "sunpump-launch";
  readonly token: SunPumpTokenRecord;
}

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

// Preview the assembled request so it matches what would be sent.
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
