/**
 * The marker for a token resolved from the user's own token book (PRD 2.13).
 *
 * A symbol the user added can shadow one they think of as official, so a receipt that resolved
 * one says so and names the contract it chose. The services publish those addresses as
 * `fromTokenBook`; nothing is added when it is absent, so official-only receipts are unchanged.
 */
import type { TextRenderContext } from "../contracts/command.js";
import { warn } from "./layout.js";

export const TOKEN_BOOK_MARK = "(from your token book)";

interface Side {
  readonly address?: string;
  readonly symbol?: string;
}

type WithBook = {
  readonly fromTokenBook?: readonly string[];
} & Partial<Record<"token0" | "token1" | "tokenIn" | "tokenOut", Side>>;

/** Whether `address` was resolved from the user's book in this result. */
export function fromTokenBook(value: unknown, address: string | undefined): boolean {
  return address !== undefined && ((value as WithBook).fromTokenBook ?? []).includes(address);
}

/** One note per token-book address, naming the symbol the receipt shows for it. */
export function tokenBookNotes(value: unknown): string[] {
  const view = value as WithBook;
  const sides = [view.token0, view.token1, view.tokenIn, view.tokenOut];
  return (view.fromTokenBook ?? []).map((address) => {
    const symbol = sides.find((side) => side?.address === address)?.symbol;
    return `${warn()} ${symbol === undefined ? "" : `${symbol} is `}${address} ${TOKEN_BOOK_MARK}.`;
  });
}

/** A formatter with the token-book notes appended under whatever it renders. */
export function withTokenBookNotes<V>(
  format: (value: V, ctx: TextRenderContext) => string,
): (value: V, ctx: TextRenderContext) => string {
  return (value, ctx) => {
    const body = format(value, ctx);
    const notes = tokenBookNotes(value);
    return notes.length === 0 ? body : `${body}\n\n${notes.join("\n")}`;
  };
}
