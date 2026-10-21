import { describe, it, expect } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import { registerX402Commands } from "./x402.js";
import { parseInputSchema } from "../shell/index.js";

const registry = new CommandRegistry();
registerX402Commands(registry, {} as never);
function parse(verb: string, values: Record<string, unknown>) {
  return parseInputSchema(registry.resolveNeutral(["x402", verb])!.input, values);
}
describe("R4 payment input contracts", () => {
  it.each([
    [{ maxAmount: "0" }, "invalid_amount"],
    [{ maxAmount: "1e3" }, "invalid_amount"],
    [{ maxRawAmount: "0", token: "USDT" }, "invalid_amount"],
    [{ maxRawAmount: (1n << 256n).toString(), token: "USDT" }, "invalid_amount"],
    [{ maxAmount: "1", maxRawAmount: "1", token: "USDT" }, "invalid_option"],
    [{ body: "", bodyFile: "body.json" }, "invalid_option"],
    [{ maxGasfreeFee: "1", maxGasfreeFeeRaw: "1" }, "invalid_option"],
  ])("rejects %j with %s", (input, code) => {
    expect(() => parse("pay", { url: "https://example.test", ...input })).toThrow(
      expect.objectContaining({ code }),
    );
  });
  it("rejects a raw payment limit that names no token, before anything is requested", () => {
    expect(() =>
      parse("pay", { url: "https://example.test", maxRawAmount: "1000000000000000000" }),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_option",
        message: expect.stringContaining("--max-raw-amount: requires --token or --asset"),
      }),
    );
  });
  it.each([{ token: "USDT" }, { asset: "0x55d398326f99059fF775485246999027B3197955" }])(
    "accepts a raw payment limit pinned by %j",
    (pin) => {
      expect(
        parse("pay", { url: "https://example.test", maxRawAmount: "1000000", ...pin }),
      ).toMatchObject({ maxRawAmount: "1000000", ...pin });
    },
  );
  it.each(["1e3", "1.5", "-1"])("rejects port literal %s", (port) => {
    expect(() => parse("serve", { payTo: "x", port })).toThrow();
  });
  it.each(["201", "1e2"])("rejects page limit %s", (limit) => {
    expect(() => parse("provider-list", { limit })).toThrow();
  });
  it("accepts the maximum uint256 and precision 18", () => {
    expect(
      parse("pay", {
        url: "https://example.test",
        maxRawAmount: ((1n << 256n) - 1n).toString(),
        asset: "x",
        decimals: "18",
      }),
    ).toMatchObject({ decimals: 18 });
  });
});
