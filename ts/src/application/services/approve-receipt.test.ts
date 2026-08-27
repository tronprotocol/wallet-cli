/**
 * The approve receipt (§7.2) — shared by both families, because TRC20 and ERC-20 share the method,
 * the hazard, and the unreadable argument.
 */
import { describe, it, expect, vi } from "vitest";
import { approveRows } from "./approve-receipt.js";
import { fromBaseUnits } from "../../domain/amounts/index.js";

const SPENDER = "0x4f2a000000000000000000000000000000009b03";
const params = (allowance: string) => [
  { type: "address", value: SPENDER },
  { type: "uint256", value: allowance },
];
const base = { displayAddress: (v: string) => v, fromBaseUnits };

describe("approveRows", () => {
  it("scales the allowance by the token's own decimals", async () => {
    await expect(
      approveRows({
        ...base,
        method: "approve(address,uint256)",
        params: params("1000000"),
        metadata: async () => ({ decimals: 6, symbol: "USDC" }),
      }),
    ).resolves.toEqual({ spender: SPENDER, allowance: "1", allowanceDecimals: 6, token: "USDC" });
  });

  // 2^256-1 is the approval that never runs out; 78 digits say only that the number is long, and
  // no decimals can make that readable — so it does not even ask the contract.
  it("calls the maximum unlimited without reading metadata", async () => {
    const metadata = vi.fn(async () => ({ decimals: 6 }));
    const rows = await approveRows({
      ...base,
      method: "approve(address,uint256)",
      params: params(String((1n << 256n) - 1n)),
      metadata,
    });

    expect(rows).toEqual({ spender: SPENDER, allowance: "unlimited" });
    expect(metadata).not.toHaveBeenCalled();
  });

  // Being unable to LABEL the amount has no bearing on the approval itself.
  it("falls back to base units when decimals cannot be read", async () => {
    await expect(
      approveRows({
        ...base,
        method: "approve(address,uint256)",
        params: params("1000000"),
        metadata: async () => {
          throw new Error("no decimals()");
        },
      }),
    ).resolves.toMatchObject({ allowance: "1000000" });
  });

  it("writes the spender in the family's own display form", async () => {
    const rows = await approveRows({
      ...base,
      displayAddress: () => "TBhCfAytweLuLLL2gr8xxxxxxxxxxxxxxx",
      method: "approve(address,uint256)",
      params: params("1"),
      metadata: async () => ({ decimals: 0 }),
    });

    expect(rows.spender).toBe("TBhCfAytweLuLLL2gr8xxxxxxxxxxxxxxx");
  });

  // Spacing is a typing habit, not a different method.
  it("matches the signature regardless of spacing", async () => {
    await expect(
      approveRows({
        ...base,
        method: "approve(address, uint256)",
        params: params("1"),
        metadata: async () => ({ decimals: 0 }),
      }),
    ).resolves.toMatchObject({ allowance: "1" });
  });

  it.each([
    ["another method", { method: "transfer(address,uint256)", params: params("1") }],
    ["a missing argument", { method: "approve(address,uint256)", params: [{ value: SPENDER }] }],
    ["a non-numeric allowance", { method: "approve(address,uint256)", params: params("many") }],
  ])("adds nothing for %s", async (_name, input) => {
    await expect(
      approveRows({ ...base, ...input, metadata: async () => ({ decimals: 6 }) }),
    ).resolves.toEqual({});
  });
});
