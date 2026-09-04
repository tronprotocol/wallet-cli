/**
 * `block` renders each family's RAW node object.
 *
 * The JSON contract for this command is deliberately "what the node said", so the two families
 * arrive in different shapes: TRON nests the header under `block_header.raw_data` and reports
 * milliseconds, while an EVM node returns a flat object of hex QUANTITY values and seconds.
 * Normalizing for humans is therefore this renderer's job, and only this renderer's.
 */
import { describe, it, expect } from "vitest";
import { TextFormatters } from "./index.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const ctxFor = (family: "tron" | "evm") => ({
  command: "block",
  net: { family } as NetworkDescriptor,
});

const TRON_BLOCK = {
  blockID: "0000000000abcdef",
  block_header: { raw_data: { number: 1234567, timestamp: 1722925264000 } },
  transactions: [{}, {}],
};

const EVM_BLOCK = {
  number: "0x12d687",
  timestamp: "0x66b1c0d0",
  hash: "0xabc",
  parentHash: "0xparent",
  gasUsed: "0xc3ed1d",
  gasLimit: "0x1c9c380",
  baseFeePerGas: "0x448b9b800",
  transactions: ["0xdead", "0xbeef"],
};

describe("block renderer", () => {
  it("reads TRON's nested header and millisecond timestamp", () => {
    const out = TextFormatters.block!({ block: TRON_BLOCK }, ctxFor("tron"))!;

    expect(out).toContain("1,234,567");
    expect(out).toContain("2024-08-06 06:21:04 UTC");
    expect(out).toContain("2");
  });

  it("decodes EVM hex quantities instead of printing them raw", () => {
    const out = TextFormatters.block!({ block: EVM_BLOCK }, ctxFor("evm"))!;

    expect(out).toContain("1,234,567");
    expect(out).not.toContain("0x12d687");
  });

  // Seconds read as milliseconds would date every EVM block to 1970.
  it("treats the EVM timestamp as seconds", () => {
    const out = TextFormatters.block!({ block: EVM_BLOCK }, ctxFor("evm"))!;

    expect(out).toContain("2024-08-06 06:21:04 UTC");
    expect(out).not.toContain("1970");
  });

  it("counts EVM transactions", () => {
    expect(TextFormatters.block!({ block: EVM_BLOCK }, ctxFor("evm"))!).toContain("2");
  });

  it("says unknown rather than crashing when the chain has no such block", () => {
    const out = TextFormatters.block!({ block: null }, ctxFor("evm"))!;

    expect(out).toContain("unknown");
  });

  /**
   * The four rows that say whether a block is full and what it cost. Without them `block` on EVM
   * answered "how many transactions" and nothing a reader could act on.
   */
  it("reports the EVM hash, parent, gas usage and base fee", () => {
    const out = TextFormatters.block!({ block: EVM_BLOCK }, ctxFor("evm"))!;

    expect(out).toContain("Hash");
    expect(out).toContain("Parent hash");
    // decoded and grouped, never the hex the node sent
    expect(out).toContain("12,840,221 / 30,000,000");
    expect(out).toContain("18.4 gwei");
  });

  // Not "a field whose value we do not know" but a concept that does not exist there; an empty
  // row would claim the former.
  it("omits the base fee row entirely on a pre-1559 chain", () => {
    const { baseFeePerGas: _dropped, ...legacy } = EVM_BLOCK;
    const out = TextFormatters.block!({ block: legacy }, ctxFor("evm"))!;

    expect(out).not.toContain("Base fee");
  });

  // The EVM rows are additive; TRON's three stay exactly as they were.
  it("leaves the TRON block rows unchanged", () => {
    const out = TextFormatters.block!({ block: TRON_BLOCK }, ctxFor("tron"))!;

    expect(out).not.toContain("Base fee");
    expect(out).not.toContain("Gas used");
    expect(out.split("\n").map((line) => line.split("  ")[0])).toEqual([
      "Number",
      "Time",
      "Transactions",
    ]);
  });
});
