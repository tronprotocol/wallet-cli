import { describe, expect, it } from "vitest";
import { TextFormatters } from "./index.js";

const render = (value: unknown) =>
  TextFormatters.sunpumpLaunch(value as Parameters<typeof TextFormatters.sunpumpLaunch>[0]);

const TOKEN = {
  address: "TNfW9m6BzWpZ4gZ8y8sJQ8PjRKzvGx1a9x",
  symbol: "TST",
  name: "Test Token",
  decimals: 18,
  totalSupply: "1000000000000000000000000000",
  status: "CREATED",
  owner: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
  market: {
    marketCapUsd: "11078.22",
    priceInTrx: "0.000032710280376636",
    priceChange24HrPercent: "0",
    volume24HrSun: "0",
    virtualLiquidity: "23707.39",
  },
  curve: {
    pumpPercentage: "0",
    currentSold: "0",
    tokenReserve: "800000000000000000000000000",
    trxReserve: "0",
  },
  createdAt: "2026-09-15 10:00",
  createTxHash: "9f2c1d0aa1b6f0f3b0d1e2c3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c77ad",
  description: "demo",
  links: {},
};

describe("a created token", () => {
  it("leads with the name, the address and the creator the service chose", () => {
    const out = render({ kind: "sunpump-launch", token: TOKEN });
    expect(out.split("\n")).toEqual([
      "✅ SunPump token created",
      "  Name         Test Token",
      "  Symbol       TST",
      "  Address      TNfW9m6BzWpZ4gZ8y8sJQ8PjRKzvGx1a9x",
      "  Creator      TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
      "  Status       CREATED",
      "  Created      2026-09-15 10:00 UTC",
      "  Create tx    9f2c1d0aa1b6f0f3b0d1e2c3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c77ad",
      "  Description  demo",
    ]);
  });

  it("prints no price, market cap, curve progress or supply", () => {
    const out = render({ kind: "sunpump-launch", token: TOKEN });
    for (const label of ["Price", "Market cap", "Curve progress", "Supply", "Vol 24h"]) {
      expect(out).not.toContain(label);
    }
    expect(out).not.toContain("11078.22");
    expect(out).not.toContain("0.000032");
  });

  it("says created, not launched", () => {
    const out = render({ kind: "sunpump-launch", token: TOKEN });
    expect(out).toContain("SunPump token created");
    expect(out.toLowerCase()).not.toContain("launched");
  });

  it("shows the logo and links only when the service returned them", () => {
    const out = render({
      kind: "sunpump-launch",
      token: {
        ...TOKEN,
        links: {
          logo: "https://static.sunpump.meme/logo/tst.png",
          website: "https://example.com",
          twitter: "https://x.com/example",
          telegram: "https://t.me/example",
        },
      },
    });
    expect(out).toContain("Logo         https://static.sunpump.meme/logo/tst.png");
    expect(out).toContain("Website      https://example.com");
    expect(out).toContain("Twitter      https://x.com/example");
    expect(out).toContain("Telegram     https://t.me/example");
  });

  it("strips control sequences out of creator-supplied text", () => {
    const out = render({
      kind: "sunpump-launch",
      token: { ...TOKEN, name: "Te\u001b[31mst", description: "line one\nline two" },
    });
    expect(out).toContain("Name         Te[31mst");
    expect(out).toContain("Description  line one line two");
    expect(out).not.toContain("\u001b");
  });
});

describe("a dry run", () => {
  const PREVIEW = {
    kind: "sunpump-launch",
    mode: "dry-run",
    name: "Test Token",
    symbol: "TST",
    description: "demo",
  };

  it("says in words that the creator will not be the reader's account", () => {
    expect(render(PREVIEW).split("\n")).toEqual([
      "⏳ Dry run sunpump launch",
      "  Name         Test Token",
      "  Symbol       TST",
      "  Creator      assigned by SunPump, not your account",
      "  Description  demo",
      "",
      "! No logo given; the token will be created without one.",
    ]);
  });

  it("shows a file logo by name and size, and drops the no-logo note", () => {
    const out = render({
      ...PREVIEW,
      image: { source: "file", path: "./assets/logo.png", bytes: 12_345 },
      links: { website: "https://example.com", twitter: "https://x.com/example" },
    });
    expect(out).toContain("Logo         logo.png (12,345 bytes)");
    expect(out).toContain("Website      https://example.com");
    expect(out).toContain("Twitter      https://x.com/example");
    expect(out).not.toContain("Telegram");
    expect(out).not.toContain("No logo given");
  });

  it("shows a base64 logo by its length", () => {
    const out = render({ ...PREVIEW, image: { source: "base64", chars: 12_345 } });
    expect(out).toContain("Logo         base64 (12,345 chars)");
  });

  it("omits what does not exist before the call", () => {
    const out = render(PREVIEW);
    for (const label of ["Address", "Status", "Created ", "Create tx"]) {
      expect(out).not.toContain(label);
    }
  });
});
