/**
 * The CLI's offset window, expressed in the only paging the market API offers.
 *
 * Every list command in this CLI takes `--limit` and `--offset`, because that is what the rest of
 * the tool takes and an agent should not learn a second dialect per service. The market API has
 * no offset: it pages by 1-based page number and size. An arbitrary offset therefore cannot be
 * served — `offset 5, limit 4` names rows 5..8, which no page boundary contains.
 *
 * Rather than silently returning the wrong rows, an offset that is not a multiple of the limit is
 * refused, and the message says so. Quietly rounding to the nearest page would hand back data the
 * caller did not ask for while looking like success.
 */
import { UsageError } from "../errors/index.js";

export interface OffsetWindow {
  readonly offset: number;
  readonly limit: number;
}

export interface PageWindow {
  /** 1-based, the only paging the service offers. */
  readonly pageNo: number;
  readonly pageSize: number;
}

export function offsetWindowToPage({ offset, limit }: OffsetWindow): PageWindow {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new UsageError("invalid_value", "--limit must be a positive integer");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new UsageError("invalid_value", "--offset must be an integer of 0 or more");
  }
  if (offset % limit !== 0) {
    throw new UsageError(
      "invalid_value",
      `--offset must be a multiple of --limit (${limit}); this service pages by whole pages`,
    );
  }
  return { pageNo: offset / limit + 1, pageSize: limit };
}

/**
 * The SunSwap market service exposes only the first 1000 rows of any ordering.
 *
 * Measured on mainnet for `/apiv2/pools`, `/pools/search`, `/tokens`, `/tokens/search` and
 * `/positions/user`: a page whose `pageNo * pageSize` passes 1000 is answered with code 4003
 * ("total size exceeds"), whatever the page size.
 */
export const SUNSWAP_MARKET_WINDOW = 1000;

/**
 * Refuse a window the SunSwap market service can never serve.
 *
 * Passed through, the service's refusal arrives as `provider_error` — exit 1, retry "same" — for a
 * request that no retry will ever answer. Kept out of `offsetWindowToPage`, which SunPump shares
 * with a service that has no such limit.
 */
export function refuseBeyondMarketWindow({ offset, limit }: OffsetWindow): void {
  if (offset + limit > SUNSWAP_MARKET_WINDOW) {
    throw new UsageError(
      "invalid_value",
      `--offset + --limit may not exceed ${SUNSWAP_MARKET_WINDOW}; the data service exposes only the first ${SUNSWAP_MARKET_WINDOW} rows of each ordering`,
    );
  }
}
