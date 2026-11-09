import { describe, it, expect } from "vitest";
import { TextFormatters } from "./index.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const ctxFor = (family: "tron" | "evm") => ({
  command: "block",
  net: { family } as NetworkDescriptor,
});

const TRON_RESULT = {
  block: { blockID: "0000000000abcdef", block_header: { raw_data: { number: 1 } } },
  number: 1234567,
  timestampMs: 1722925264000,
  transactionCount: 2,
};

// The EVM block result: normalized fields beside the node's verbatim block.
const EVM_RESULT = {
  block: { number: "0x12d687", timestamp: "0x66b1c0d0" },
  number: 1234567,
  timestamp: 1722925264000,
  hash: "0xabc",
  parentHash: "0xparent",
  transactionCount: 2,
  gasUsed: "12840221",
  gasLimit: "30000000",
  baseFeeWei: "18400000000",
};

describe("block renderer", () => {
  it("formats TRON's summary fields, not the raw header", () => {
    const out = TextFormatters.block!(TRON_RESULT, ctxFor("tron"))!;

    expect(out).toContain("1,234,567");
    expect(out).toContain("2024-08-06 06:21:04 UTC");
    expect(out).toContain("2");
  });

  it("prints the normalized EVM number and millisecond timestamp", () => {
    const out = TextFormatters.block!(EVM_RESULT, ctxFor("evm"))!;

    expect(out).toContain("#1,234,567");
    expect(out).toContain("2024-08-06 06:21:04 UTC");
    expect(out).not.toContain("0x12d687");
  });

  it("does not decode the node's raw EVM block", () => {
    const out = TextFormatters.block!(
      { block: { number: "0x12d687", timestamp: "0x66b1c0d0" } },
      ctxFor("evm"),
    )!;

    expect(out).not.toContain("1,234,567");
    expect(out).toContain("unknown");
  });

  it("counts EVM transactions", () => {
    expect(TextFormatters.block!(EVM_RESULT, ctxFor("evm"))!).toMatch(/Transactions\s+2/);
  });

  it("reports the EVM hash, parent, gas usage and base fee", () => {
    const out = TextFormatters.block!(EVM_RESULT, ctxFor("evm"))!;

    expect(out).toContain("Hash");
    expect(out).toContain("Parent hash");
    expect(out).toContain("12,840,221 / 30,000,000");
    expect(out).toContain("18.4 gwei");
  });

  it("omits the base fee row entirely on a pre-1559 chain", () => {
    const { baseFeeWei: _dropped, ...legacy } = EVM_RESULT;
    const out = TextFormatters.block!(legacy, ctxFor("evm"))!;

    expect(out).not.toContain("Base fee");
  });

  it("leaves the TRON block rows unchanged", () => {
    const out = TextFormatters.block!(TRON_RESULT, ctxFor("tron"))!;

    expect(out).not.toContain("Base fee");
    expect(out).not.toContain("Gas used");
    expect(out.split("\n").map((line) => line.split("  ")[0])).toEqual([
      "Number",
      "Time",
      "Transactions",
    ]);
  });
});
