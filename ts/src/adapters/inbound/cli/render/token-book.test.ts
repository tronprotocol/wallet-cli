import { describe, expect, it } from "vitest";
import { TextFormatters } from "./index.js";
import { tokenBookNotes } from "./token-book.js";

const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const WTRX = "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a";

describe("token-book notes", () => {
  it("names nothing when every token is official", () => {
    expect(tokenBookNotes({ token0: { address: USDT, symbol: "USDT" } })).toEqual([]);
  });

  it("names the symbol and the contract of each token from the book", () => {
    const notes = tokenBookNotes({
      token0: { address: USDT, symbol: "MYUSD" },
      token1: { address: WTRX, symbol: "WTRX" },
      fromTokenBook: [USDT],
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain(`MYUSD is ${USDT} (from your token book).`);
  });

  // The liquidity receipts keep addresses out of their rows; the note is the one place it shows.
  it("is appended under a liquidity receipt", () => {
    const out = TextFormatters.sunswapRemoveLiquidity(
      {
        protocol: "V2",
        mode: "dry-run",
        token0: { address: USDT, symbol: "MYUSD", decimals: 6, amount: "1", amountMinimum: "1" },
        token1: { address: WTRX, symbol: "WTRX", decimals: 6, amount: "1", amountMinimum: "1" },
        recipient: USDT,
        deadline: 1790234906,
        fromTokenBook: [USDT],
      } as never,
      { net: { family: "tron", nativeSymbol: "TRX", id: "tron:3448148188" } } as never,
    );
    expect(out).toContain(`MYUSD is ${USDT} (from your token book).`);
  });
});
