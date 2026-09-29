/**
 * Zod fragments shared by the SunPump listing commands.
 *
 * Kept in one place so the paging and ordering flags cannot drift apart between `token-list` and
 * `token-search`: an agent that learned `--limit` on one listing should not find a different
 * ceiling on the next.
 *
 * Everything here is refused at PARSE time, because none of it depends on the service. A page
 * that is too large, an offset that no page boundary contains, an ordering the service does not
 * apply and an empty keyword are all knowable before a request is sent — and each of them is a
 * failure this particular service would answer with a confident 200 rather than an error.
 */
import { z } from "zod";
import type { RefinementCtx } from "zod";
import {
  SUNPUMP_ORDER_BY_NAMES,
  SUNPUMP_SORT_DIRECTIONS,
} from "../../../../../domain/sunpump/market.js";

/**
 * The largest page this CLI asks for.
 *
 * A ceiling of our own: the service will serve a page of 200, but a listing that large is not a
 * CLI answer, and PM 9 fixes the limit at 50 for both commands.
 */
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

/**
 * The orderings the service really applies.
 *
 * `launched` is absent on purpose. It is a real field on every token and the service answers an
 * ordering by it with a 200 — having quietly sorted by market cap instead, while echoing the
 * field name back. PM 2.4 lists it; it cannot be served, so it is not offered.
 */
export const orderByField = (fallback: (typeof SUNPUMP_ORDER_BY_NAMES)[number]) =>
  z.enum(SUNPUMP_ORDER_BY_NAMES).default(fallback).describe(`order by: ${ORDER_BY_LIST}`);

/**
 * `--limit` and `--offset`, checked together.
 *
 * The offset has to be a whole number of pages: the service pages by page number and size, so
 * `offset 5, limit 4` names rows 5..8, which no page contains. Rounding to the nearest page
 * would hand back rows the caller did not ask for while looking like success.
 */
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
