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
    [{ maxAmount: "0" }, "invalid_amount"], [{ maxAmount: "1e3" }, "invalid_amount"],
    [{ maxRawAmount: "0" }, "invalid_amount"], [{ maxRawAmount: (1n << 256n).toString() }, "invalid_amount"],
    [{ maxAmount: "1", maxRawAmount: "1" }, "invalid_option"],
    [{ body: "", bodyFile: "body.json" }, "invalid_option"],
    [{ maxGasfreeFee: "1", maxGasfreeFeeRaw: "1" }, "invalid_option"],
  ])("rejects %j with %s", (input, code) => {
    expect(() => parse("pay", { url: "https://example.test", ...input })).toThrow(expect.objectContaining({ code }));
  });
  it.each(["1e3", "1.5", "-1"])("rejects port literal %s", (port) => {
    expect(() => parse("serve", { payTo: "x", port })).toThrow();
  });
  it.each(["201", "1e2"])("rejects page limit %s", (limit) => {
    expect(() => parse("provider-list", { limit })).toThrow();
  });
  it("accepts the maximum uint256 and precision 18", () => {
    expect(parse("pay", { url: "https://example.test", maxRawAmount: ((1n << 256n) - 1n).toString(), asset: "x", decimals: "18" })).toMatchObject({ decimals: 18 });
  });
});
