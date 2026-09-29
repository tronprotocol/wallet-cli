/**
 * The `sunswap swap` receipts.
 *
 * This file exists because of a real defect: a dry run of a router swap printed "Selling into the
 * curve approves the SunPump proxy without limit" directly above a row showing an allowance of
 * 1000000. The warning was keyed on approvals existing rather than on which market answered, which
 * was right on the day it was written and wrong the moment a second market appeared. A warning that
 * contradicts the row beneath it is worse than no warning, so the market-dependent wording is
 * pinned from both sides here.
 */
import { describe, expect, it } from "vitest";
import { SunSwapSwapFormatters } from "./sunswap-swap.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const PERMIT2 = "TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9";
const ROUTER = "TQqgNg13s2DjvXhW1ky4v6TsR8wZGvb7Y4";
const LAUNCHPAD = "TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw";

const CTX = {
  net: { family: "tron", nativeSymbol: "TRX", id: "tron:728126428" },
  accountLabel: "main",
} as never;

const render = (value: Record<string, unknown>) =>
  SunSwapSwapFormatters.sunswapSwap(value as never, CTX);

const TOKEN_SIDE = { address: USDT, symbol: "USDT", decimals: 6 };
const TRX_SIDE = { address: TRX, symbol: "TRX", decimals: 6 };

/** A router swap spending a token: two grants, neither unlimited. */
const routerSwap = (extra: Record<string, unknown> = {}) => ({
  kind: "sunswap-swap",
  market: "sunswap",
  account: "TE9kPMtaMjfZN95CuPRsCHUQGWwx9EcJW8",
  amountIn: "1000000",
  tokenIn: TOKEN_SIDE,
  tokenOut: TRX_SIDE,
  amountOutExpected: "2921823",
  amountOutMinimum: "2907213",
  slippage: "0.005",
  tradingFee: "50",
  route: { path: [TOKEN_SIDE, TRX_SIDE], protocols: ["V2"], poolFees: ["0", "0"] },
  approvals: [{ spender: PERMIT2, amount: "1000000" }],
  permit: { permit2: PERMIT2, spender: ROUTER, amount: "1000000", expiration: "1790234906" },
  ...extra,
});

/** A curve sale, which really does grant an unlimited allowance. */
const curveSwap = (extra: Record<string, unknown> = {}) => ({
  kind: "sunswap-swap",
  market: "sunpump",
  amountIn: "1000000000000000000000",
  tokenIn: { address: LAUNCHPAD, symbol: "Justin", decimals: 18 },
  tokenOut: TRX_SIDE,
  amountOutExpected: "29401",
  amountOutMinimum: "27931",
  slippage: "0.05",
  tradingFee: "10000",
  route: { path: [{ symbol: "Justin" }, { symbol: "TRX" }] },
  approvals: [{ spender: LAUNCHPAD, amount: "unlimited" }],
  ...extra,
});

describe("the approval note follows the market, not the presence of approvals", () => {
  it("does not claim a router swap approves anything without limit", () => {
    const out = render(routerSwap({ mode: "dry-run", feeCovers: "approvals" }));
    expect(out).not.toContain("without limit");
    expect(out).not.toContain("SunPump proxy");
    // What it says instead, over a row showing the exact figure.
    expect(out).toContain("exactly this trade");
    expect(out).toContain("1000000");
  });

  it("still says a curve sale grants an unlimited allowance", () => {
    const out = render(curveSwap({ mode: "dry-run" }));
    expect(out).toContain("approves the SunPump proxy without limit");
    expect(out).toContain("upgradeable proxy");
  });
});

describe("the Permit2 grant is shown, not only stored", () => {
  /**
   * A signature that lets a contract move tokens without a transaction of ours is the part a person
   * most needs to read before approving it, so the amount and the expiry are rows.
   */
  it("names the amount, the spender and the expiry on a dry run", () => {
    const out = render(routerSwap({ mode: "dry-run", feeCovers: "approvals" }));
    expect(out).toContain("Permit grants");
    expect(out).toContain("1000000 to TQqgNg13s2");
    expect(out).toContain("Permit expires");
    expect(out).toContain("(1 hour)");
  });

  // A permit outlives the transaction, which is the whole point of one, so the record of the trade
  // has to say what was authorized and until when.
  it("keeps the grant on a confirmed receipt", () => {
    const out = render(
      routerSwap({ stage: "confirmed", txId: "abc", blockNumber: 1, approvalTxIds: ["def"] }),
    );
    expect(out).toContain("Permit grants");
    expect(out).toContain("Approval tx");
  });

  it("shows no permit rows for a swap that spends TRX", () => {
    const out = render({
      ...routerSwap({ stage: "confirmed", txId: "abc" }),
      tokenIn: TRX_SIDE,
      tokenOut: TOKEN_SIDE,
      approvals: undefined,
      permit: undefined,
    });
    expect(out).not.toContain("Permit grants");
    expect(out).not.toContain("Spender");
  });
});

describe("what a dry run admits it cannot do", () => {
  it("labels the fee as covering the approval only, and says why", () => {
    const out = render(routerSwap({ mode: "dry-run", feeCovers: "approvals", fee: {} }));
    expect(out).toContain("Fee (est, approval only)");
    expect(out).toContain("cannot be estimated until the Permit2 authorization is signed");
  });

  it("labels it plainly when the whole swap was priced", () => {
    const out = render({
      ...routerSwap({ mode: "dry-run", feeCovers: "all", fee: {} }),
      tokenIn: TRX_SIDE,
      tokenOut: TOKEN_SIDE,
      approvals: undefined,
      permit: undefined,
    });
    expect(out).toContain("Fee (est)");
    expect(out).not.toContain("approval only");
  });
});

describe("an unverified hook", () => {
  /**
   * It was warned about only in the quote table, where a caller is not yet spending anything. The
   * modes that spend are the ones that need it.
   */
  it.each([
    ["dry-run", { mode: "dry-run", feeCovers: "approvals" }],
    ["submitted", { txId: "abc" }],
    ["confirmed", { stage: "confirmed", txId: "abc" }],
  ])("warns in %s, not only in the quote table", (_name, extra) => {
    const out = render(
      routerSwap({
        ...extra,
        route: { path: [TOKEN_SIDE, TRX_SIDE], containsUnverifiedHook: true },
      }),
    );
    expect(out).toContain("unverified hook contract");
  });
});

describe("a swap that failed on chain", () => {
  /**
   * The approval and the grant are still standing. Both are bounded to this trade and lapse within
   * the hour — which is the reason they are bounded — but a reader should be told rather than find
   * out later.
   */
  it("says the grant outlived the failed transaction, and when it lapses", () => {
    const out = render(routerSwap({ stage: "failed", txId: "abc", result: "REVERT" }));
    expect(out).toContain("still in place");
    expect(out).toContain("limited to this trade");
    expect(out).toContain("expire at");
  });

  it("says nothing of the sort when there was no permit", () => {
    const out = render({
      ...routerSwap({ stage: "failed", txId: "abc" }),
      permit: undefined,
      approvals: undefined,
    });
    expect(out).not.toContain("still in place");
  });
});

it("keeps a confirmed swap quote labelled as an estimate", () => {
  expect(render(routerSwap({ stage: "confirmed" }))).toContain("Received (est)");
});
