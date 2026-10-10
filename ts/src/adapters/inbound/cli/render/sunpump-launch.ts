/**
 * Text for `sunpump launch` — the created token's card, and the same card as a preview.
 *
 * Two things this renderer is careful about:
 *
 * - **Whose token it is.** The creator is chosen by SunPump, not by this CLI, so `Creator` is on
 *   the card before anything else about the token and the preview spells the consequence out in
 *   words, since before the call there is no address to show. A reader who skims must not come
 *   away thinking the coin is theirs.
 * - **No price, no market cap, no curve progress, no supply.** json carries them; a person does
 *   not see them. Every brand-new token has the same figures — the curve's starting price and a
 *   market cap that moves only with the TRX rate — so they are not a market's opinion of anything,
 *   and printing them beside "created" reads as "what you just made is worth this much".
 *
 * Row labels match `sunpump token-info`, so the same token reads the same way in both places.
 */
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

/** what the preview puts where an address will be: the fact, not a dash. */
const UNASSIGNED_CREATOR = "assigned by SunPump, not your account";

/** the logo as a person recognises it — the file's own name and its size on disk. */
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
        // Before the call there is no creator to name, and leaving the row out would be the one
        // omission a reader fills in with "mine".
        ["Creator", UNASSIGNED_CREATOR],
        ["Logo", value.image === undefined ? "" : logoSource(value.image)],
        ["Website", untrusted(value.links?.website ?? "")],
        ["Twitter", untrusted(value.links?.twitter ?? "")],
        ["Telegram", untrusted(value.links?.telegram ?? "")],
        ["Description", untrusted(value.description)],
      ]);
      // Not a `meta.warnings` entry: nothing went wrong and nothing is degraded. It is a preview
      // telling a reader what the token will be missing while they can still add it.
      return value.image === undefined
        ? `${body}\n\n! No logo given; the token will be created without one.`
        : body;
    }
    const token = value.token;
    return receipt(ok(), "SunPump token created", [
      ["Name", untrusted(token.name)],
      ["Symbol", untrusted(token.symbol)],
      ["Address", token.address],
      // The service's chosen creator, NOT the active account. Ahead of everything the token is
      // worth, because it is the fact a reader is most likely to assume wrongly.
      ["Creator", token.owner],
      // "CREATED", never "launched": the token is on the curve and moves to SunSwap only once the
      // curve fills. The command name is the upstream's; the receipt says what happened.
      ["Status", token.status],
      ["Created", token.createdAt === "" ? "" : `${token.createdAt} UTC`],
      ["Create tx", token.createTxHash],
      // Present exactly when the service accepted an image, which is how a caller confirms the
      // upload rather than taking our word for it.
      ["Logo", untrusted(token.links.logo ?? "")],
      ["Website", untrusted(token.links.website ?? "")],
      ["Twitter", untrusted(token.links.twitter ?? "")],
      ["Telegram", untrusted(token.links.telegram ?? "")],
      ["Description", untrusted(token.description)],
    ]);
  },
};
