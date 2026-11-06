// User token-book symbols can shadow official symbols; identify the resolved contract.
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

export function fromTokenBook(value: unknown, address: string | undefined): boolean {
  return address !== undefined && ((value as WithBook).fromTokenBook ?? []).includes(address);
}

export function tokenBookNotes(value: unknown): string[] {
  const view = value as WithBook;
  const sides = [view.token0, view.token1, view.tokenIn, view.tokenOut];
  return (view.fromTokenBook ?? []).map((address) => {
    const symbol = sides.find((side) => side?.address === address)?.symbol;
    return `${warn()} ${symbol === undefined ? "" : `${symbol} is `}${address} ${TOKEN_BOOK_MARK}.`;
  });
}

export function withTokenBookNotes<V>(
  format: (value: V, ctx: TextRenderContext) => string,
): (value: V, ctx: TextRenderContext) => string {
  return (value, ctx) => {
    const body = format(value, ctx);
    const notes = tokenBookNotes(value);
    return notes.length === 0 ? body : `${body}\n\n${notes.join("\n")}`;
  };
}
