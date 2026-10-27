// The service creates the token and selects its owner; no caller signing or broadcasting.
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { SunPumpTokenRecord } from "./market-data.js";

// Request fields only; imageBase64 is raw base64 without a data: prefix.
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
  // Reject service error codes even in HTTP 200 responses.
  launchToken(
    network: NetworkDescriptor,
    request: SunPumpTokenLaunchRequest,
  ): Promise<SunPumpTokenRecord>;
}
