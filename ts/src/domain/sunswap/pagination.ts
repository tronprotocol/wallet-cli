// The market API serves whole pages, so offsets must align to the limit.
import { errorMessage, inputRef, UsageError } from "../errors/index.js";

export interface OffsetWindow {
  readonly offset: number;
  readonly limit: number;
}

export interface PageWindow {
  // 1-based.
  readonly pageNo: number;
  readonly pageSize: number;
}

export function offsetWindowToPage({ offset, limit }: OffsetWindow): PageWindow {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("limit")} must be a positive integer`,
    );
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("offset")} must be an integer of 0 or more`,
    );
  }
  if (offset % limit !== 0) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("offset")} must be a multiple of ${inputRef("limit")} (${limit}); this service pages by whole pages`,
    );
  }
  return { pageNo: offset / limit + 1, pageSize: limit };
}

// The SunSwap market service exposes only the first 1000 rows of each ordering.
export const SUNSWAP_MARKET_WINDOW = 1000;

export function refuseBeyondMarketWindow({ offset, limit }: OffsetWindow): void {
  if (offset + limit > SUNSWAP_MARKET_WINDOW) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("offset")} + ${inputRef("limit")} may not exceed ${SUNSWAP_MARKET_WINDOW}; the data service exposes only the first ${SUNSWAP_MARKET_WINDOW} rows of each ordering`,
    );
  }
}
