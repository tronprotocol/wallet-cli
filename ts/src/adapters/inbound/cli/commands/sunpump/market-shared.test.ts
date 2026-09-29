/**
 * The refusals the three SunPump catalogue commands make before sending anything.
 *
 * All of them depend on nothing remote, so they belong to the schema — and each of them guards
 * against the same failure mode: this service answers a bad request with HTTP 200 and a plausible
 * list, so a value that is not caught here is never caught at all.
 *
 * Exercised through each spec's own fields and refine, which is what the shell composes.
 */
import { describe, expect, it } from "vitest";
import type { ZodIssue } from "zod";
import type { ChainSpec } from "../../contracts/command.js";
import { sunpumpTokenListSpec } from "./token-list.js";
import { sunpumpTokenSearchSpec } from "./token-search.js";
import { sunpumpTokenInfoSpec } from "./token-info.js";

interface SafeParse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { issues: (ZodIssue & { params?: { errorCode?: string } })[] };
}

function schemaFor(spec: ChainSpec) {
  const fields = spec.baseFields as unknown as {
    superRefine: (refine: unknown) => { safeParse: (value: unknown) => SafeParse };
    safeParse: (value: unknown) => SafeParse;
  };
  return spec.baseRefine === undefined ? fields : fields.superRefine(spec.baseRefine as unknown);
}

const list = schemaFor(sunpumpTokenListSpec);
const search = schemaFor(sunpumpTokenSearchSpec);
const info = schemaFor(sunpumpTokenInfoSpec);

function refusals(
  schema: { safeParse: (value: unknown) => SafeParse },
  value: Record<string, unknown>,
): { path: string; code?: string }[] {
  return (schema.safeParse(value).error?.issues ?? []).map((issue) => ({
    path: String(issue.path[0]),
    code: issue.params?.errorCode,
  }));
}

const CREATOR = "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj";

describe("paging", () => {
  it("defaults to a page of 20 from the start", () => {
    const parsed = list.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ limit: 20, offset: 0, orderBy: "created", sort: "desc" });
  });

  it.each([
    [sunpumpTokenListSpec.path.join(" "), list, {}],
    [sunpumpTokenSearchSpec.path.join(" "), search, { keyword: "dog" }],
  ])("%s refuses a page over the ceiling as limit_exceeded", (_name, schema, base) => {
    expect(refusals(schema, { ...base, limit: 51 })).toEqual([
      { path: "limit", code: "limit_exceeded" },
    ]);
    expect(schema.safeParse({ ...base, limit: 50 }).success).toBe(true);
  });

  // The service pages by page number and size: offset 5 with limit 4 names rows 5..8, which no
  // page contains. Rounding to the nearest page would return rows nobody asked for.
  it("refuses an offset that is not a whole number of pages", () => {
    expect(refusals(list, { limit: 20, offset: 5 })).toEqual([{ path: "offset", code: undefined }]);
    expect(list.safeParse({ limit: 20, offset: 40 }).success).toBe(true);
  });

  it("refuses a page size that is not a positive whole number", () => {
    expect(refusals(list, { limit: 0 })).toEqual([{ path: "limit", code: undefined }]);
    expect(refusals(list, { limit: 2.5 })).toEqual([{ path: "limit", code: undefined }]);
    expect(refusals(list, { offset: -20 })).toEqual([{ path: "offset", code: undefined }]);
  });
});

describe("ordering", () => {
  // Every name here was verified to actually sort the service's rows. `launched` was not: the
  // service answers it with marketCap order and a 200, so it is not on the list.
  it.each(["created", "market-cap", "volume-24h", "price-change-24h"])(
    "accepts --order-by %s",
    (orderBy) => {
      expect(list.safeParse({ orderBy }).success).toBe(true);
    },
  );

  it("refuses an ordering the service would silently ignore", () => {
    for (const orderBy of ["launched", "tokenCreatedInstant", "holders"]) {
      expect(list.safeParse({ orderBy }).success).toBe(false);
    }
  });

  it("refuses a direction it does not understand", () => {
    expect(list.safeParse({ sort: "ascending" }).success).toBe(false);
    expect(list.safeParse({ sort: "asc" }).success).toBe(true);
  });

  /**
   * `--owner` answers from `/token/search/by_owner`, which drops `sort` rather than rejecting it
   * and always returns newest-created first. Accepting the flags would print a creation-ordered
   * list under a market-cap heading.
   */
  it("refuses an ordering that cannot be applied to a creator's tokens", () => {
    expect(refusals(list, { owner: CREATOR, orderBy: "market-cap" })).toEqual([
      { path: "orderBy", code: "invalid_option" },
    ]);
    expect(refusals(list, { owner: CREATOR, sort: "asc" })).toEqual([
      { path: "sort", code: "invalid_option" },
    ]);
    // the one ordering it does apply is the command's own default, so --owner alone is fine
    expect(list.safeParse({ owner: CREATOR }).success).toBe(true);
  });
});

describe("addresses and keywords", () => {
  it.each(["contract", "owner"])("refuses a malformed --%s as invalid_address", (flag) => {
    expect(refusals(list, { [flag]: "not-an-address" })).toEqual([
      { path: flag, code: "invalid_address" },
    ]);
  });

  it("refuses a malformed token-info address as invalid_address", () => {
    expect(refusals(info, { address: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kZ" })).toEqual([
      { path: "address", code: "invalid_address" },
    ]);
    expect(info.safeParse({ address: CREATOR }).success).toBe(true);
  });

  // A blank keyword is "no filter" to this service: it answers with the entire ranked catalogue
  // at HTTP 200, which reads exactly like a search that matched everything.
  it("refuses a keyword that is empty or only whitespace", () => {
    for (const keyword of ["", "   ", "\t\n"]) {
      expect(search.safeParse({ keyword }).success).toBe(false);
    }
    expect(search.safeParse({ keyword: "Knight" }).success).toBe(true);
  });

  it("defaults every search filter to off", () => {
    const parsed = search.safeParse({ keyword: "dog" });
    expect(parsed.data).toMatchObject({
      onSunswap: false,
      twitterLaunch: false,
      sunAgentLaunch: false,
      orderBy: "market-cap",
      sort: "desc",
    });
  });
});
