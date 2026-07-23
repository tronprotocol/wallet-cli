import { describe, expect, it, vi } from "vitest";
import type { AccountDescriptor } from "../../../../domain/types/index.js";
import { CommandRegistry } from "../registry/index.js";
import { isChainCommand } from "../contracts/index.js";
import { registerWalletCommands } from "./wallet.js";

const ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const descriptor = {
  accountId: "wlt_selected",
  label: "treasury",
  type: "watch",
  index: null,
  active: false,
  addresses: { tron: ADDRESS },
} satisfies AccountDescriptor;

function command(options: {
  output?: "text" | "json";
  encoded?: string | null;
  account?: string;
} = {}) {
  const walletService = {
    current: vi.fn(() => descriptor),
  };
  const qr = {
    encode: vi.fn(() =>
      options.encoded === undefined ? "QR-MATRIX" : options.encoded
    ),
  };
  const registry = new CommandRegistry();
  registerWalletCommands(registry, {
    walletService: walletService as never,
    ledger: {} as never,
    qr,
  });
  const current = registry.resolveNeutral(["current"]);
  if (!current || isChainCommand(current)) {
    throw new Error("current command missing");
  }
  const context = {
    activeAccount: options.account ?? "wlt_selected",
    output: options.output ?? "text",
    warn: vi.fn(),
  };
  return { current, context, walletService, qr };
}

describe("current --qr", () => {
  it("encodes exactly the selected account's TRON address in text mode", async () => {
    const fixture = command({ account: "wlt_selected", encoded: "QR" });
    const result = await fixture.current.run(
      fixture.context as never,
      undefined,
      { qr: true },
    );

    expect(fixture.walletService.current).toHaveBeenCalledWith(
      "wlt_selected",
    );
    expect(fixture.qr.encode).toHaveBeenCalledWith(ADDRESS);
    expect(result).toMatchObject({
      receiveQr: "QR",
      receiveAddress: ADDRESS,
    });
  });

  it("keeps JSON data unchanged and never builds terminal art", async () => {
    const fixture = command({ output: "json" });
    const result = await fixture.current.run(
      fixture.context as never,
      undefined,
      { qr: true },
    );

    expect(result).toEqual(descriptor);
    expect(fixture.qr.encode).not.toHaveBeenCalled();
  });

  it("warns and returns the full normal descriptor on a narrow terminal", async () => {
    const fixture = command({ encoded: null });
    const result = await fixture.current.run(
      fixture.context as never,
      undefined,
      { qr: true },
    );

    expect(result).toEqual(descriptor);
    expect(fixture.context.warn).toHaveBeenCalledWith(
      expect.stringContaining("too narrow"),
    );
  });
});
