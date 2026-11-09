// SunPump assigns the creator; initial curve figures are not market valuations.
import { formatInt } from "./scalars.js";
import { untrusted } from "./sunpump-market.js";
import { ok, pending, receipt } from "./layout.js";

interface LaunchedToken {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly status: string;
  readonly owner: string;
  readonly createdAt: string;
  readonly createTxHash: string;
  readonly description: string;
  readonly links: {
    readonly logo?: string;
    readonly twitter?: string;
    readonly telegram?: string;
    readonly website?: string;
  };
}

interface LaunchResult {
  readonly token: LaunchedToken;
}

interface LaunchPreview {
  readonly mode: "dry-run";
  readonly name: string;
  readonly symbol: string;
  readonly description: string;
  readonly image?:
    | { readonly source: "file"; readonly path: string; readonly bytes: number }
    | { readonly source: "base64"; readonly chars: number };
  readonly links?: {
    readonly website?: string;
    readonly twitter?: string;
    readonly telegram?: string;
  };
}

type LaunchView = LaunchResult | LaunchPreview;

const UNASSIGNED_CREATOR = "assigned by SunPump, not your account";

function logoSource(image: NonNullable<LaunchPreview["image"]>): string {
  if (image.source === "base64") return `base64 (${formatInt(image.chars)} chars)`;
  const name = image.path.split(/[\\/]/).pop() ?? image.path;
  return `${untrusted(name)} (${formatInt(image.bytes)} bytes)`;
}

export const SunPumpLaunchFormatters = {
  sunpumpLaunch(value: LaunchView): string {
    if ("mode" in value) {
      const body = receipt(pending(), "Dry run sunpump launch", [
        ["Name", untrusted(value.name)],
        ["Symbol", untrusted(value.symbol)],
        ["Creator", UNASSIGNED_CREATOR],
        ["Logo", value.image === undefined ? "" : logoSource(value.image)],
        ["Website", untrusted(value.links?.website ?? "")],
        ["Twitter", untrusted(value.links?.twitter ?? "")],
        ["Telegram", untrusted(value.links?.telegram ?? "")],
        ["Description", untrusted(value.description)],
      ]);
      return value.image === undefined
        ? `${body}\n\n! No logo given; the token will be created without one.`
        : body;
    }
    const token = value.token;
    return receipt(ok(), "SunPump token created", [
      ["Name", untrusted(token.name)],
      ["Symbol", untrusted(token.symbol)],
      ["Address", token.address],
      ["Creator", token.owner],
      // Creation starts the bonding curve; migration to SunSwap happens when it fills.
      ["Status", token.status],
      ["Created", token.createdAt === "" ? "" : `${token.createdAt} UTC`],
      ["Create tx", token.createTxHash],
      ["Logo", untrusted(token.links.logo ?? "")],
      ["Website", untrusted(token.links.website ?? "")],
      ["Twitter", untrusted(token.links.twitter ?? "")],
      ["Telegram", untrusted(token.links.telegram ?? "")],
      ["Description", untrusted(token.description)],
    ]);
  },
};
