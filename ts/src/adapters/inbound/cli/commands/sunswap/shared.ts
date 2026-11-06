import { z } from "zod";
import {
  SUNSWAP_PROTOCOL_FILTERS,
  SUNSWAP_SCOPES,
} from "../../../../../domain/sunswap/protocol.js";

const SCOPE_LIST = SUNSWAP_SCOPES.join(", ");

// Always send the scope; omitting it can mix scopes and duplicate tokens.
export const protocolField = z.string().default("ALL").describe(`protocol scope: ${SCOPE_LIST}`);

export const limitField = z.coerce
  .number()
  .default(20)
  .describe("maximum number of rows to return");

export const offsetField = z.coerce.number().default(0).describe("number of rows to skip");

// Omit the filter for all protocols; ALL is only a statistic scope.
export const protocolFilterField = z
  .string()
  .optional()
  .describe(`filter by protocol: ${SUNSWAP_PROTOCOL_FILTERS.join(", ")}`);
