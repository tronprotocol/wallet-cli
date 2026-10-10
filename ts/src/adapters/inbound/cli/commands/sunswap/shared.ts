/**
 * Zod fragments shared by the SunSwap listing commands.
 *
 * Kept in one place so the paging and scope flags cannot drift apart between commands: an agent
 * that learned `--limit` on one listing should not find a different default on the next.
 *
 * Note what is deliberately ABSENT. There is no `--include-blacklisted`: pool and token records
 * carry no blacklist marker, so listing them "without marking" would put impersonations into the
 * table unlabelled, and the service's filter is always left on. And `token-list` has no `--sort`,
 * because the token endpoints expose a sort field but no direction — offering a flag the service
 * ignores would be a promise the output does not keep.
 */
import { z } from "zod";
import {
  SUNSWAP_PROTOCOL_FILTERS,
  SUNSWAP_SCOPES,
} from "../../../../../domain/sunswap/protocol.js";

const SCOPE_LIST = SUNSWAP_SCOPES.join(", ");

/**
 * The scope is always sent, never left to the service's default: omitting it makes the
 * service mix statistic scopes and return the same token more than once.
 */
export const protocolField = z.string().default("ALL").describe(`protocol scope: ${SCOPE_LIST}`);

export const limitField = z.coerce
  .number()
  .default(20)
  .describe("maximum number of rows to return");

export const offsetField = z.coerce.number().default(0).describe("number of rows to skip");

/**
 * `--protocol` where it FILTERS rows rather than choosing a statistic scope.
 *
 * `ALL` is not offered: "all of them" is spelled by omitting the flag, and there is no such
 * protocol for a pool or a position to belong to. The list is generated from the same constant
 * the validator checks against, so help, `--json-schema` and the runtime cannot drift apart —
 * which is exactly how `ALL` came to be accepted here while the schema said it was not a value.
 */
export const protocolFilterField = z
  .string()
  .optional()
  .describe(`filter by protocol: ${SUNSWAP_PROTOCOL_FILTERS.join(", ")}`);
