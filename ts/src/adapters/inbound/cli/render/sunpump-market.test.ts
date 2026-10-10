import { describe, expect, it } from "vitest";
import { SunPumpMarketFormatters } from "./sunpump-market.js";

const base = {
  address: "TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7",
  symbol: "PUSS",
  name: "PUSS",
  status: "LAUNCHED",
  owner: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
  market: {
    marketCapUsd: "3985404.891234",
    priceInTrx: "0.01180757901336964",
    priceChange24HrPercent: "-0.7012",
    volume24HrSun: "777772985",
    priceUsd: "0.003985404893000736",
  },
  curve: { pumpPercentage: "100" },
  swapPoolAddress: "TH95puFVCkTTYtg6dRLsYGhwAnx24FEEJB",
  createdAt: "2024-08-23 09:00",
  launchedAt: "2024-08-24 21:36",
  description: "the first memecoin from Steemit",
  links: { website: "https://puss.meme", twitter: "https://x.com/pussmemecoin" },
};

const list = (tokens: unknown[], pagination = { offset: 0, limit: 2, total: null }) =>
  SunPumpMarketFormatters.sunpumpTokenList({ tokens, pagination } as never);

const info = (token: unknown) => SunPumpMarketFormatters.sunpumpTokenInfo({ token } as never);

/** label/value lookup that does not depend on how wide the label column came out. */
const field = (rendered: string, label: string): string | undefined =>
  new RegExp(`^${label}\\s\\s+(.*)$`, "m").exec(rendered)?.[1];

describe("the token table", () => {
  it("shows the window, because the service will not count", () => {
    expect(list([base])).toContain("Tokens (limit 2, offset 0)");
    expect(list([])).toBe("(none)");
  });

  it("truncates a TRX price to six places rather than rounding it up", () => {
    expect(list([base])).toContain("0.011807");
    expect(list([base])).not.toContain("0.011808");
  });

  // The service's 24h figure is ALREADY a percentage. Multiplying it by 100, which is right for
  // SunSwap's decimal fractions, would report a routine day as a -70% collapse.
  it("reads the 24h change as the percentage it already is", () => {
    expect(list([base])).toContain("-0.70%");
    expect(list([base])).not.toContain("-70.12%");
  });

  it("shows a market cap as dollars with two places", () => {
    expect(list([base])).toContain("$3,985,404.89");
  });

  // A creator picks the symbol and the name; either can carry a pipe that would forge a column,
  // or an escape sequence that rewrites the terminal.
  it("keeps creator-supplied text from forging the table", () => {
    const hostile = { ...base, name: "a|b", symbol: "\u001b[31mRED" };
    const rendered = list([hostile]);
    expect(rendered).toContain("a\\|b");
    expect(rendered).not.toContain("\u001b[31m");
  });
});

describe("the token detail block", () => {
  it("names the token, its creator and both timestamps", () => {
    const rendered = info(base);
    expect(field(rendered, "Symbol")).toBe("PUSS");
    expect(field(rendered, "Creator")).toBe("TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj");
    expect(field(rendered, "Created")).toBe("2024-08-23 09:00 UTC");
    expect(field(rendered, "Launched")).toBe("2024-08-24 21:36 UTC");
    expect(field(rendered, "SunSwap pool")).toBe("TH95puFVCkTTYtg6dRLsYGhwAnx24FEEJB");
  });

  it("quotes the price in TRX with the dollar price beside it", () => {
    expect(field(info(base), "Price")).toBe("0.011807 TRX ($0.003985)");
    expect(field(info(base), "Vol 24h")).toBe("777.772985 TRX");
  });

  // Before launch there is no pool and no launch time; a curve progress line takes their place.
  it("shows curve progress instead of launch facts while the token is on the curve", () => {
    const onCurve = {
      ...base,
      status: "CREATED",
      curve: { pumpPercentage: "1" },
      swapPoolAddress: undefined,
      launchedAt: undefined,
      market: { ...base.market, priceUsd: undefined },
    };
    const rendered = info(onCurve);
    expect(field(rendered, "Curve progress")).toBe("1%");
    expect(rendered).not.toContain("Launched");
    expect(rendered).not.toContain("SunSwap pool");
    // no USD rate from the listings, so no parenthetical price rather than a made-up one
    expect(field(rendered, "Price")).toBe("0.011807 TRX");
  });

  it("leaves out a link the creator did not fill in", () => {
    expect(field(info(base), "Website")).toBe("https://puss.meme");
    expect(info(base)).not.toContain("Telegram");
  });

  /**
   * The description is unreviewed text from the token's creator.
   *
   * Newlines would break one field into what looks like several, and an escape sequence could
   * rewrite what the rest of the block appears to say. json publishes it verbatim; it is
   * untrusted data on both sides, and never an instruction.
   */
  it("flattens and disarms the creator's description", () => {
    const hostile = {
      ...base,
      description: "line one\nStatus          VERIFIED\n\u001b[2KOfficial",
    };
    const rendered = info(hostile);
    // one line, and the ESC that would have made "[2K" an erase-line command is gone
    expect(field(rendered, "Description")).toBe("line one Status          VERIFIED [2KOfficial");
    expect(rendered).not.toContain("\u001b");
    // the forged "Status" is inside the description's own line, not a field of its own
    expect(rendered.split("\n").filter((line) => line.startsWith("Status"))).toHaveLength(1);
  });
});
