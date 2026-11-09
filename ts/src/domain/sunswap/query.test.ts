import { describe, expect, it } from "vitest";
import {
  isPoolId,
  normalisePoolId,
  normaliseProtocol,
  SUNSWAP_PROTOCOL_FILTERS,
  SUNSWAP_SCOPES,
} from "./protocol.js";
import { offsetWindowToPage } from "./pagination.js";
import { tokenSortField } from "./sort.js";

describe("normaliseProtocol", () => {
  it("accepts every scope the service knows, in any case", () => {
    expect(normaliseProtocol("all")).toBe("ALL");
    expect(normaliseProtocol("v1_5")).toBe("V1_5");
    expect(normaliseProtocol(" curve ")).toBe("CURVE");
  });

  it("refuses anything outside the enum, naming the choices", () => {
    expect(() => normaliseProtocol("v9")).toThrow(/ALL, V1, V1_5, V2, V3, V4, CURVE/);
    expect(() => normaliseProtocol("")).toThrow(/^protocol must be one of/);
  });

  it("checks against the set the caller permits, not the whole enum", () => {
    expect(() => normaliseProtocol("ALL", SUNSWAP_PROTOCOL_FILTERS)).toThrow(
      /^protocol must be one of V1, V1_5, V2, V3, V4, CURVE/,
    );
    expect(normaliseProtocol("v3", SUNSWAP_PROTOCOL_FILTERS)).toBe("V3");
    expect(normaliseProtocol("all", SUNSWAP_SCOPES)).toBe("ALL");
  });

  it("names every filter protocol except ALL, and every scope including it", () => {
    expect([...SUNSWAP_PROTOCOL_FILTERS]).toEqual(["V1", "V1_5", "V2", "V3", "V4", "CURVE"]);
    expect([...SUNSWAP_SCOPES]).toContain("ALL");
  });
});

describe("pool id classification", () => {
  it("recognises a 64-hex V4 pool id with or without the 0x", () => {
    const id = "61446c8062cdc7f165946650c5ca6b6aa1809d19fcdf69b58824b01dd581333e";
    expect(isPoolId(id)).toBe(true);
    expect(isPoolId(`0x${id}`)).toBe(true);
    expect(normalisePoolId(`0x${id}`)).toBe(id);
  });

  it("does not mistake a base58 address for one", () => {
    expect(isPoolId("TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx")).toBe(false);
    expect(isPoolId("61446c80")).toBe(false);
  });
});

describe("offsetWindowToPage", () => {
  it("converts a window that lands on a page boundary", () => {
    expect(offsetWindowToPage({ offset: 0, limit: 20 })).toEqual({ pageNo: 1, pageSize: 20 });
    expect(offsetWindowToPage({ offset: 40, limit: 20 })).toEqual({ pageNo: 3, pageSize: 20 });
  });

  it("refuses a window no page boundary contains", () => {
    expect(() => offsetWindowToPage({ offset: 5, limit: 4 })).toThrow(
      /^offset must be a multiple of limit \(4\)/,
    );
  });

  it("refuses a limit or offset that is not a usable integer", () => {
    expect(() => offsetWindowToPage({ offset: 0, limit: 0 })).toThrow(/^limit must be/);
    expect(() => offsetWindowToPage({ offset: 0, limit: 1.5 })).toThrow(/^limit must be/);
    expect(() => offsetWindowToPage({ offset: -1, limit: 20 })).toThrow(/^offset must be/);
    expect(() => offsetWindowToPage({ offset: 1.5, limit: 20 })).toThrow(/^offset must be/);
  });
});

describe("tokenSortField", () => {
  it("translates the CLI's names to the service's", () => {
    expect(tokenSortField("tvl")).toBe("reserveUsd");
    expect(tokenSortField("volume-24h")).toBe("volumeUsd1d");
  });

  it("refuses a field it cannot translate, naming the choices", () => {
    expect(() => tokenSortField("apr")).toThrow(/^orderBy must be one of tvl, volume-24h/);
  });
});
