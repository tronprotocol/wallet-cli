import { describe, expect, it } from "vitest";
import { tokenBookNotes, withTokenBookNotes } from "./token-book.js";

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

  it("is appended under the formatted receipt", () => {
    const format = withTokenBookNotes((_value: unknown) => "receipt");
    const out = format(
      {
        token0: { address: USDT, symbol: "MYUSD" },
        token1: { address: WTRX, symbol: "WTRX" },
        fromTokenBook: [USDT],
      },
      {} as never,
    );
    expect(out.startsWith("receipt\n\n")).toBe(true);
    expect(out).toContain(`MYUSD is ${USDT} (from your token book).`);
  });
});
