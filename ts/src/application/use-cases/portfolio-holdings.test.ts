/**
 * Portfolio holding rows.
 *
 * `account portfolio` is one command, so both families must report the same row shape. These
 * helpers are shared rather than copied for exactly that reason — a second copy is how the two
 * listings drift into reporting different fields for the same thing.
 */
import { describe, it, expect } from "vitest";
import { holding, portfolioTotal, unavailableHolding } from "./portfolio-holdings.js";

describe("holding", () => {
  it("scales the raw balance by the token's decimals", () => {
    expect(holding("erc20", "USDT", 6, "5000000", null)).toMatchObject({
      kind: "erc20",
      symbol: "USDT",
      decimals: 6,
      rawBalance: "5000000",
      balance: "5",
    });
  });

  it("values the holding at the given price", () => {
    expect(holding("native", "ETH", 18, "2000000000000000000", 1500).valueUsd).toBe(3000);
  });

  it("reports a null value when there is no price, rather than zero", () => {
    // Zero would read as "this is worthless", which is a different claim from "we don't know".
    const row = holding("native", "ETH", 18, "1000000000000000000", null);
    expect(row.priceUsd).toBeNull();
    expect(row.valueUsd).toBeNull();
  });

  it("carries extra identity fields through", () => {
    expect(
      holding("erc20", "USDT", 6, "1", null, { id: "0xdAC1", source: "official" }),
    ).toMatchObject({ id: "0xdAC1", source: "official" });
  });
});

describe("unavailableHolding", () => {
  // One unreadable token must not sink the whole portfolio: the row keeps its identity and says
  // why it has no numbers, instead of vanishing or reporting a fictitious zero.
  it("keeps the row's identity and nulls only the numbers", () => {
    expect(unavailableHolding("erc20", "USDT", 6, { id: "0xdAC1" })).toMatchObject({
      kind: "erc20",
      symbol: "USDT",
      decimals: 6,
      id: "0xdAC1",
      rawBalance: null,
      balance: null,
      valueUsd: null,
      balanceUnavailable: true,
      reason: "rpc_error",
    });
  });

  it("shares its field names with a readable holding", () => {
    const ok = Object.keys(holding("erc20", "USDT", 6, "1", 1));
    const bad = Object.keys(unavailableHolding("erc20", "USDT", 6));

    expect(ok.every((key) => bad.includes(key))).toBe(true);
  });
});

describe("portfolioTotal", () => {
  it("sums only the rows that have a value", () => {
    expect(portfolioTotal([{ valueUsd: 10 }, { valueUsd: null }, { valueUsd: 2.5 }])).toBe(12.5);
  });

  it("reports null when nothing could be valued", () => {
    expect(portfolioTotal([{ valueUsd: null }, { valueUsd: null }])).toBeNull();
  });

  it("rounds to six places, as the per-row values are", () => {
    expect(portfolioTotal([{ valueUsd: 0.1234567 }, { valueUsd: 0.1 }])).toBe(0.223457);
  });
});
