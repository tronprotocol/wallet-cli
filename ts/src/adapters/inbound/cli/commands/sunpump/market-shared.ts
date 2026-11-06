import { z } from "zod";
import type { RefinementCtx } from "zod";
import {
  SUNPUMP_ORDER_BY_NAMES,
  SUNPUMP_SORT_DIRECTIONS,
} from "../../../../../domain/sunpump/market.js";

export const MAX_PAGE_SIZE = 50;

export const ORDER_BY_LIST = SUNPUMP_ORDER_BY_NAMES.join(", ");

const SORT_LIST = SUNPUMP_SORT_DIRECTIONS.join(", ");

export const limitField = z.coerce
  .number()
  .default(20)
  .describe(`maximum number of tokens to return, at most ${MAX_PAGE_SIZE}`);

export const offsetField = z.coerce.number().default(0).describe("number of tokens to skip");

export const sortField = z
  .enum(SUNPUMP_SORT_DIRECTIONS)
  .default("desc")
  .describe(`sort direction: ${SORT_LIST}`);

// Do not offer launched ordering: the service silently substitutes market-cap ordering.
export const orderByField = (fallback: (typeof SUNPUMP_ORDER_BY_NAMES)[number]) =>
  z.enum(SUNPUMP_ORDER_BY_NAMES).default(fallback).describe(`order by: ${ORDER_BY_LIST}`);

// Offsets must align to whole pages because the service accepts page number and size.
export function pageWindowRefine(value: { limit: number; offset: number }, ctx: RefinementCtx) {
  const { limit, offset } = value;
  if (!Number.isInteger(limit) || limit <= 0) {
    ctx.addIssue({ code: "custom", path: ["limit"], message: "must be a positive integer" });
    return;
  }
  if (limit > MAX_PAGE_SIZE) {
    ctx.addIssue({
      code: "custom",
      path: ["limit"],
      message: `must be at most ${MAX_PAGE_SIZE}`,
      params: { errorCode: "limit_exceeded" },
    });
    return;
  }
  if (!Number.isInteger(offset) || offset < 0) {
    ctx.addIssue({ code: "custom", path: ["offset"], message: "must be an integer of 0 or more" });
    return;
  }
  if (offset % limit !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["offset"],
      message: `must be a multiple of --limit (${limit}); this service pages by whole pages`,
    });
  }
}
